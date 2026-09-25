require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();


// ========================================
// Middleware
// ========================================

app.use(cors());
app.use(express.json());


// ========================================
// HTTP Server
// ========================================

const server = http.createServer(app);


// ========================================
// Socket.IO
// ========================================

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});


// ========================================
// Temporary Request Storage
// ========================================
//
// For now we keep requests in memory.
// Later we can move this to MongoDB.
//

const requests = {};


// ========================================
// Serve Web Page
// ========================================

app.use(express.static(path.join(__dirname, "web")));


// ========================================
// Health Check
// ========================================

app.get("/", (req, res) => {

    res.json({
        message: "WhereNow API is running",
        status: "ok",
    });

});


// ========================================
// CREATE LOCATION REQUEST
// ========================================

app.post("/location-request", (req, res) => {

    const { phoneNumber } = req.body;


    // Validation

    if (!phoneNumber) {

        return res.status(400).json({
            message: "Phone number is required",
        });

    }


    // Create unique request ID

    const requestId =
        Date.now().toString();


    // Store request

    requests[requestId] = {

        requestId: requestId,

        phoneNumber: phoneNumber,

        status: "pending",

        createdAt: new Date().toISOString(),

        location: null,

    };


    console.log(
        "Location request created:",
        requestId
    );


    // Return response

    res.status(201).json({

        message: "Location request created",

        requestId: requestId,

        shareUrl:
            `https://wherenow-backend-gfvd.onrender.com/?requestId=${requestId}`,

    });

});


// ========================================
// GET LOCATION REQUEST
// ========================================

app.get("/location-request/:requestId", (req, res) => {

    const { requestId } = req.params;


    const request =
        requests[requestId];


    if (!request) {

        return res.status(404).json({

            message: "Location request not found",

        });

    }


    res.json({

        requestId: request.requestId,

        status: request.status,

        createdAt: request.createdAt,

        location: request.location,

    });

});


// ========================================
// RECEIVE LOCATION
// ========================================

app.post("/location", (req, res) => {

    const {
        requestId,
        latitude,
        longitude,
    } = req.body;


    // Validation

    if (
        !requestId ||
        latitude === undefined ||
        longitude === undefined
    ) {

        return res.status(400).json({

            message:
                "requestId, latitude and longitude are required",

        });

    }


    // Check request

    const request =
        requests[requestId];


    if (!request) {

        return res.status(404).json({

            message: "Location request not found",

        });

    }


    // Save latest location

    request.location = {

        latitude: latitude,

        longitude: longitude,

        updatedAt:
            new Date().toISOString(),

    };


    request.status = "active";


    console.log(
        "Location received:",
        request.location
    );


    // Send location to everyone
    // inside this request room

    io.to(requestId).emit(
        "location-update",
        request.location
    );


    res.json({

        message:
            "Location received successfully",

        location:
            request.location,

    });

});


// ========================================
// SOCKET.IO
// ========================================

io.on("connection", (socket) => {

    console.log(
        "Socket connected:",
        socket.id
    );


    // ------------------------------------
    // JOIN LOCATION REQUEST
    // ------------------------------------

    socket.on(
        "join-request",
        (requestId) => {

            if (!requestId) {

                console.log(
                    "No request ID provided"
                );

                return;

            }


            // Check request exists

            if (!requests[requestId]) {

                console.log(
                    "Invalid request ID:",
                    requestId
                );

                socket.emit(
                    "request-error",
                    {
                        message:
                            "Location request not found",
                    }
                );

                return;

            }


            // Join Socket.IO room

            socket.join(requestId);


            console.log(
                `Socket ${socket.id} joined request ${requestId}`
            );


            // Send current request state

            socket.emit(
                "request-status",
                {
                    requestId: requestId,

                    status:
                        requests[requestId].status,

                    location:
                        requests[requestId].location,
                }
            );

        }
    );


    // ------------------------------------
    // LIVE LOCATION UPDATE
    // ------------------------------------

    socket.on(
        "location-update",
        (data) => {

            const {
                requestId,
                latitude,
                longitude,
            } = data;


            if (
                !requestId ||
                latitude === undefined ||
                longitude === undefined
            ) {

                return;

            }


            const request =
                requests[requestId];


            if (!request) {

                socket.emit(
                    "request-error",
                    {
                        message:
                            "Location request not found",
                    }
                );

                return;

            }


            // Update latest location

            request.location = {

                latitude,

                longitude,

                updatedAt:
                    new Date().toISOString(),

            };


            request.status = "active";


            console.log(
                "Live location:",
                request.location
            );


            // Send location to everyone
            // except sender

            socket.to(requestId).emit(
                "location-update",
                request.location
            );

        }
    );


    // ------------------------------------
    // DISCONNECT
    // ------------------------------------

    socket.on(
        "disconnect",
        () => {

            console.log(
                "Socket disconnected:",
                socket.id
            );

        }
    );

});


// ========================================
// SERVER START
// ========================================

const PORT =
    process.env.PORT || 3000;


server.listen(
    PORT,
    () => {

        console.log(
            `WhereNow server running on port ${PORT}`
        );

    }
);
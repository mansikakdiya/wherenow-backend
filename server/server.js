
require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

// Temporary in-memory storage
const requests = {};


// ========================================
// Serve web files
// ========================================

app.use(express.static(path.join(__dirname, "web")));


// ========================================
// B - Share Location Page
// ========================================

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "web", "index.html")
    );
});


// ========================================
// A - Request Location Page
// ========================================

app.get("/requester", (req, res) => {
    res.sendFile(
        path.join(__dirname, "web", "requester.html")
    );
});


// ========================================
// Create Location Request
// ========================================

app.post("/location-request", (req, res) => {

    const requestId =
        Date.now().toString();

    requests[requestId] = {

        requestId: requestId,

        status: "pending",

        createdAt:
            new Date().toISOString(),

        location: null,

    };

    console.log(
        "Location request created:",
        requestId
    );

    res.status(201).json({

        message:
            "Location request created",

        requestId: requestId,

        shareUrl:
            `${req.protocol}://${req.get("host")}/?requestId=${requestId}`,

    });

});


// ========================================
// Get Request Status
// ========================================

app.get(
    "/location-request/:requestId",
    (req, res) => {

        const { requestId } =
            req.params;

        const request =
            requests[requestId];

        if (!request) {

            return res.status(404).json({

                message:
                    "Location request not found",

            });

        }

        res.json({

            requestId:
                request.requestId,

            status:
                request.status,

            createdAt:
                request.createdAt,

            location:
                request.location,

        });

    }
);


// ========================================
// Receive Location through HTTP
// ========================================

app.post("/location", (req, res) => {

    const {
        requestId,
        latitude,
        longitude,
    } = req.body;


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


    const request =
        requests[requestId];


    if (!request) {

        return res.status(404).json({

            message:
                "Location request not found",

        });

    }


    request.location = {

        latitude:
            latitude,

        longitude:
            longitude,

        updatedAt:
            new Date().toISOString(),

    };


    request.status =
        "active";


    console.log(
        "Location received:",
        request.location
    );


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
// Socket.IO
// ========================================

io.on("connection", (socket) => {

    console.log(
        "Socket connected:",
        socket.id
    );


    // ========================================
    // Join Request Room
    // ========================================

    socket.on(
        "join-request",
        (requestId) => {

            if (!requestId) {

                console.log(
                    "No request ID provided"
                );

                return;

            }


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


            socket.join(requestId);


            console.log(
                `Socket ${socket.id} joined request ${requestId}`
            );


            socket.emit(
                "request-status",
                {

                    requestId:
                        requestId,

                    status:
                        requests[requestId].status,

                    location:
                        requests[requestId].location,

                }
            );

        }
    );


    // ========================================
    // Live Location Update
    // ========================================

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

                console.log(
                    "Invalid location data"
                );

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


            request.location = {

                latitude:
                    latitude,

                longitude:
                    longitude,

                updatedAt:
                    new Date().toISOString(),

            };


            request.status =
                "active";


            console.log(
                "Live location:",
                request.location
            );


            // Send location to everyone
            // in this request room
            socket.to(requestId).emit(
                "location-update",
                request.location
            );

        }
    );


    // ========================================
    // Disconnect
    // ========================================

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
// Start Server
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

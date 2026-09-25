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
// Pages
// ========================================

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "web", "index.html")
    );
});

app.get("/requester", (req, res) => {
    res.sendFile(
        path.join(__dirname, "web", "requester.html")
    );
});


// ========================================
// Create Location Request
// ========================================

app.post("/location-request", (req, res) => {

    const requestId = Date.now().toString();

    requests[requestId] = {

        requestId,

        status: "pending",

        createdAt:
            new Date().toISOString(),

        location: null,

        requesterSocketId: null,

        sharerSocketId: null,
    };

    console.log(
        "Location request created:",
        requestId
    );

    res.status(201).json({

        message:
            "Location request created",

        requestId,

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
// Socket.IO
// ========================================

io.on("connection", (socket) => {

    console.log(
        "Socket connected:",
        socket.id
    );


    // ========================================
    // Join Request
    // ========================================

    socket.on(
        "join-request",
        (data) => {

            const {
                requestId,
                role,
            } = data || {};

            if (!requestId || !role) {

                console.log(
                    "Invalid join request"
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


            socket.join(requestId);


            if (role === "requester") {

                request.requesterSocketId =
                    socket.id;

                console.log(
                    `Requester ${socket.id} joined ${requestId}`
                );

            } else if (role === "sharer") {

                request.sharerSocketId =
                    socket.id;

                console.log(
                    `Sharer ${socket.id} joined ${requestId}`
                );
            }


            socket.emit(
                "request-status",
                {

                    requestId,

                    status:
                        request.status,

                    location:
                        request.location,
                }
            );
        }
    );


    // ========================================
    // Start Sharing
    // ========================================

    socket.on(
        "start-sharing",
        (data) => {

            const {
                requestId,
            } = data || {};

            const request =
                requests[requestId];

            if (!request) {
                return;
            }


            if (
                request.sharerSocketId !==
                socket.id
            ) {
                return;
            }


            request.status =
                "active";


            console.log(
                `Location sharing started: ${requestId}`
            );


            io.to(requestId).emit(
                "sharing-started",
                {
                    message:
                        "Location sharing started",
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
            } = data || {};

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
                return;
            }


            // Only B can send location
            if (
                request.sharerSocketId !==
                socket.id
            ) {
                return;
            }


            request.location = {

                latitude,

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


            socket.to(requestId).emit(
                "location-update",
                request.location
            );
        }
    );


    // ========================================
    // Stop Sharing
    // ========================================

    socket.on(
        "stop-sharing",
        (data) => {

            const {
                requestId,
            } = data || {};

            const request =
                requests[requestId];

            if (!request) {
                return;
            }


            if (
                request.sharerSocketId !==
                socket.id
            ) {
                return;
            }


            request.status =
                "stopped";


            console.log(
                `Location sharing stopped: ${requestId}`
            );


            io.to(requestId).emit(
                "sharing-stopped",
                {
                    message:
                        "Location sharing stopped",

                    location:
                        request.location,
                }
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


            for (const requestId in requests) {

                const request =
                    requests[requestId];


                // Only B disconnecting
                // ends location sharing
                if (
                    request.sharerSocketId ===
                    socket.id
                ) {

                    request.sharerSocketId =
                        null;


                    if (
                        request.status ===
                        "active"
                    ) {

                        request.status =
                            "disconnected";


                        console.log(
                            `Sharer disconnected: ${requestId}`
                        );


                        io.to(requestId).emit(
                            "sharing-disconnected",
                            {
                                message:
                                    "Location sharing disconnected",

                                location:
                                    request.location,
                            }
                        );
                    }
                }


                // A disconnected
                if (
                    request.requesterSocketId ===
                    socket.id
                ) {

                    request.requesterSocketId =
                        null;
                }
            }
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
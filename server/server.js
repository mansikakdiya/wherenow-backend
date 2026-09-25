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
  },
});

const requests = {};

app.use(express.static(path.join(__dirname, "web")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "web", "index.html"));
});
app.post("/location-request", (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({
      message: "Phone number is required",
    });
  }

  const requestId = Date.now().toString();

  requests[requestId] = {
    phoneNumber: phoneNumber,
    status: "pending",
  };

  res.status(201).json({
    message: "Location request created",
    requestId: requestId,
  });
});

app.post("/location", (req, res) => {
  const { requestId, latitude, longitude } = req.body;

  if (!requestId || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      message: "requestId, latitude and longitude are required",
    });
  }

  console.log("B's location:", {
    requestId,
    latitude,
    longitude,
  });

  res.status(200).json({
    message: "Location received successfully",
  });
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-request", (requestId) => {
    socket.join(requestId);

    console.log(`Socket ${socket.id} joined request ${requestId}`);
  });

  socket.on("location-update", (data) => {
    const { requestId, latitude, longitude } = data;

    console.log("Live location:", data);

    socket.to(requestId).emit("location-update", {
      latitude,
      longitude,
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

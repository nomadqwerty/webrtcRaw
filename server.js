const fs = require("fs");
const https = require("http");
const express = require("express");
const app = express();
const socketio = require("socket.io");
const { off } = require("process");
app.use(express.static(__dirname));

//we need a key and cert to run https
//we generated them with mkcert
// $ mkcert create-ca
// $ mkcert create-cert
// const key = fs.readFileSync("cert.key");
// const cert = fs.readFileSync("cert.crt");

//we changed our express setup so we can use https
//pass the key and cert to createServer on https
const expressServer = https.createServer(app);
//create our socket.io server... it will listen to our express port
const io = socketio(expressServer, {
  cors: {
    origin: [
      "https://cdee-105-113-40-185.ngrok-free.app",
      "http://localhost:8181/",
      // 'https://LOCAL-DEV-IP-HERE' //if using a phone or another computer
    ],
    methods: ["GET", "POST"],
  },
});
expressServer.listen(8181, () => {
  console.log("running on port: ", 8181);
});

//offers will contain {}
const offers = [
  // offererUserName
  // offer
  // offerIceCandidates
  // answererUserName
  // answer
  // answererIceCandidates
];
const connectedSockets = [
  //username, socketId
];

const singleOffers = [];

io.on("connection", (socket) => {
  // console.log("Someone has connected");
  const userName = socket.handshake.auth.userName;
  const password = socket.handshake.auth.password;

  if (password !== "x") {
    socket.disconnect(true);
    return;
  }
  connectedSockets.push({
    socketId: socket.id,
    userName,
  });

  //a new client has joined. If there are any offers available,
  //emit them out
  if (offers.length) {
    socket.emit("availableOffers", offers);
  }

  socket.on("newOffer", (newOffer) => {
    offers.push({
      offererUserName: userName,
      offer: newOffer.offer,
      offerIceCandidates: [],
      answererUserName: null,
      answer: null,
      answererIceCandidates: [],
      offerId: newOffer.offerId,
      answerId: null,
    });
    // console.log(newOffer.sdp.slice(50))
    //send out to all connected sockets EXCEPT the caller
    socket.broadcast.emit("newOfferAwaiting", offers.slice(-1));
  });

  socket.on("newAnswer", (offerObj, ackFunction) => {
    console.log(offerObj.answerId, " answer id");
    //emit this answer (offerObj) back to CLIENT1
    //in order to do that, we need CLIENT1's socketid
    const socketToAnswer = connectedSockets.find(
      (s) => s.userName === offerObj.offererUserName
    );
    if (!socketToAnswer) {
      console.log("No matching socket");
      return;
    }
    //we found the matching socket, so we can emit to it!
    const socketIdToAnswer = socketToAnswer.socketId;
    //we find the offer to update so we can emit it
    const offerToUpdate = offers.find(
      (o) => o.offererUserName === offerObj.offererUserName
    );
    if (!offerToUpdate) {
      console.log("No OfferToUpdate");
      return;
    }
    //send back to the answerer all the iceCandidates we have already collected
    ackFunction(offerToUpdate.offerIceCandidates);
    offerToUpdate.answer = offerObj.answer;
    offerToUpdate.answererUserName = userName;
    offerToUpdate.answerId = offerObj.answerId;
    //socket has a .to() which allows emiting to a "room"
    //every socket has it's own room
    socket.to(socketIdToAnswer).emit("answerResponse", offerToUpdate);
  });

  socket.on("sendIceCandidateToSignalingServer", (iceCandidateObj) => {
    const { didIOffer, iceUserName, iceCandidate } = iceCandidateObj;
    // console.log(iceCandidate);
    if (didIOffer) {
      //this ice is coming from the offerer. Send to the answerer
      const offerInOffers = offers.find(
        (o) => o.offererUserName === iceUserName
      );
      if (offerInOffers) {
        offerInOffers.offerIceCandidates.push(iceCandidate);
        // 1. When the answerer answers, all existing ice candidates are sent
        // 2. Any candidates that come in after the offer has been answered, will be passed through
        if (offerInOffers.answererUserName) {
          //pass it through to the other socket
          const socketToSendTo = connectedSockets.find(
            (s) => s.userName === offerInOffers.answererUserName
          );
          if (socketToSendTo) {
            socket
              .to(socketToSendTo.socketId)
              .emit("receivedIceCandidateFromServer", iceCandidate);
          } else {
            console.log("Ice candidate recieved but could not find answere");
          }
        }
      }
    } else {
      //this ice is coming from the answerer. Send to the offerer
      //pass it through to the other socket
      const offerInOffers = offers.find(
        (o) => o.answererUserName === iceUserName
      );
      const socketToSendTo = connectedSockets.find(
        (s) => s.userName === offerInOffers.offererUserName
      );
      if (socketToSendTo) {
        offerInOffers.answererIceCandidates.push(iceCandidate);
        socket
          .to(socketToSendTo.socketId)
          .emit("receivedIceCandidateFromServer", iceCandidate);
      } else {
        console.log("Ice candidate recieved but could not find offerer");
      }
    }
    // console.log(offers)
  });
  socket.on("remoteTracksMuted", (ids) => {
    console.log("muted tracks");
    // console.log(ids);
    socket.to(ids.toId).emit("mutedTracks", ids);
  });
  socket.on("newSingleOffer", (data) => {
    console.log("new offer");
    // console.log(data);
    for (let i = 0; i < singleOffers.length; i++) {
      if (singleOffers[i]?.offerId === data.ids.fromId) {
        singleOffers[i] = undefined;
        console.log("deleted old offer from socketId: ", data.ids.fromId);
      }
    }
    singleOffers.push({
      offerId: data.ids.fromId,
      offer: data.offer,
      offerIce: [],
      answer: null,
      answerIce: [],
    });
    socket.to(data.ids.toId).emit("answerSingleOffer", data);
  });
  socket.on("sendIceCandidateToSignalingSocket", (data) => {
    console.log(data.didIOffer);
    if (data.didIOffer) {
      singleOffers.forEach((offer) => {
        if (offer?.offerId === data.ids.fromId) {
          console.log("found offer to add ice to ");
          offer.offerIce.push(data.iceCandidate);
          console.log(offer.offerId);
          // console.log(offer);
        }
      });
      // socket.to(data.ids.toId).emit("addSingleNewIce", data.iceCandidate);
    } else {
      let found = false;
      singleOffers.forEach((offer) => {
        if (offer?.offerId === data.ids.toId) {
          console.log("found answer to add ice to ");
          offer.answerIce.push(data.iceCandidate);
          console.log(offer.offerId);
          found = true;
          answerIceList = offer;
        }
      });
      if (found) {
        singleOffers.forEach((offer) => {
          if (offer?.offerId === data.ids.toId) {
            console.log("return answer ice to offer ");
            // console.log(offer);
            socket.to(data.ids.toId).emit("addIceAnswerNew", {
              answerIce: offer.answerIce,
              ids: data.ids,
            });
          }
        });
      }
    }
  });
  socket.on("newSingleAnswer", (data, ackFunction) => {
    console.log("return offer ices");

    singleOffers.forEach((offer) => {
      if (offer?.offerId === data.ids.fromId) {
        console.log("found offer to add ice to return ");
        console.log(offer.answerIce);
        ackFunction(offer.offerIce);
        // console.log(data.answer);
        // console.log(offer);
        offer.answerId = data.ids.toId;
        socket.to(data.ids.fromId).emit("addAnswerSdp", {
          answer: data.answer,
          ids: data.ids,
        });
      }
    });
  });

  socket.on("addedNewIceToRtc", (data) => {
    for (let i = 0; i < singleOffers.length; i++) {
      console.log(singleOffers[i].offerId, data.ids.toId, data.ids.fromId);
      if (singleOffers[i]?.offerId === data.ids.toId) {
        // singleOffers[i] = undefined;
      }
    }
  });

  socket.on("getOfferObject", (data, ackFunction) => {
    // console.log(data);
    let found = false;
    for (let i = 0; i < offers.length; i++) {
      if (offers[i].offerId === data.fromId) {
        console.log(offers[i].answerId, data.fromId);
        ackFunction(offers[i]);
        found = true;
        // socket.to(offers[i].answerId).emit("receiveScreen", data);
      }
      if (offers[i].answerId === data.fromId) {
        console.log(offers[i].offerId, data.fromId);
        ackFunction(offers[i]);
        found = true;
        // socket.to(offers[i].answerId).emit("receiveScreen", data);
      }
    }
    if (!found) {
      for (let i = 0; i < singleOffers.length; i++) {
        if (singleOffers[i].offerId === data.fromId) {
          console.log(singleOffers[i].answerId, data.fromId);
          ackFunction(singleOffers[i]);
          found = true;
          // socket.to(offers[i].answerId).emit("receiveScreen", data);
        }
      }
    }
  });
  socket.on("renewHandShake", (data) => {
    console.log(data.answerId, " renew handshake to");
    socket.to(data.answerId).emit("reNewForScreen", data);
  });

  socket.on("newScreenOffer", (data) => {
    console.log("screen offer");
    // console.log(data);
    let fromId = data.peerIds.fromId;
    let answerId = data.peerIds.ids.answerId;
    let offerId = data.peerIds.ids.offerId;
    console.log(fromId, answerId, offerId);
    if (fromId === offerId) {
      console.log("to id", answerId, fromId);
      socket.to(answerId).emit("answerScreenOffer", data);
    }
    if (fromId === answerId) {
      console.log("to id", answerId, fromId);
      socket.to(offerId).emit("answerScreenOffer", data);
    }
  });
  socket.on("newScreenAnswer", (data) => {
    console.log("screen answer");
    // console.log(data);
    let fromId = data.peerIds.fromId;
    let answerId = data.peerIds.ids.answerId;
    let offerId = data.peerIds.ids.offerId;
    console.log(fromId, answerId, offerId);
    if (fromId === offerId) {
      console.log("to id", answerId, fromId);
      socket.to(answerId).emit("addScreenAnswer", data);
    }
    if (fromId === answerId) {
      console.log("to id", answerId, fromId);
      socket.to(offerId).emit("addScreenAnswer", data);
    }
  });
  socket.on("sendIceCandidateForScreen", (data) => {
    console.log("screen ice");
    let fromId = data.peerIds.fromId;
    let answerId = data.peerIds.ids.answerId;
    let offerId = data.peerIds.ids.offerId;
    if (data.didIOfferScreen) {
      // console.log(fromId, answerId, offerId);
      if (fromId === offerId) {
        // console.log("to id", answerId, fromId);
        socket.to(answerId).emit("addScreenIce", data);
      }
      if (fromId === answerId) {
        // console.log("to id", answerId, fromId);
        socket.to(offerId).emit("addScreenIce", data);
      }
    } else {
      if (fromId === offerId) {
        // console.log("to id", answerId, fromId);
        socket.to(answerId).emit("addRemoteScreenIce", data);
      }
      if (fromId === answerId) {
        // console.log("to id", answerId, fromId);
        socket.to(offerId).emit("addRemoteScreenIce", data);
      }
    }
    // console.log(data);
  });
  // socket.on("iamSharing", (data) => {
  //   console.log(data);

  //   for (let i = 0; i < offers.length; i++) {
  //     if (offers[i].offerId === data.fromId) {
  //       console.log(offers[i].answerId, data.fromId);
  //       socket.to(offers[i].answerId).emit("receiveScreen", data);
  //     }
  //   }
  // });
});

//on connection get all available offers and call createOfferEls
socket.on("availableOffers", (offers) => {
  console.log(offers);
  createOfferEls(offers);
});

//someone just made a new offer and we're already here - call createOfferEls
socket.on("newOfferAwaiting", (offers) => {
  createOfferEls(offers);
});

socket.on("answerResponse", (offerObj) => {
  console.log(offerObj);
  addAnswer(offerObj);
});

socket.on("receivedIceCandidateFromServer", (iceCandidate) => {
  addNewIceCandidate(iceCandidate);
  console.log(iceCandidate);
});

socket.on("mutedTracks", async (ids) => {
  console.log(ids);
  console.log("restart rtc");
  console.log(peerConnection);
  console.log(localVideoEl);
  console.log(remoteVideoEl);
  //   gum
  localVideoEl.srcObject = null;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    // audio: true,
  });
  localVideoEl.srcObject = stream;
  localStream = stream;

  //   create peerConn
  remoteVideoEl.srcObject = null;
  peerConnection = await new RTCPeerConnection(peerConfiguration);
  remoteStream = new MediaStream();
  remoteVideoEl.srcObject = remoteStream;

  localStream.getTracks().forEach((track) => {
    //add localtracks so that they can be sent once the connection is established
    // peerConnection.addTransceiver(track, { streams: [localStream] });
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.addEventListener("signalingstatechange", (event) => {
    console.log(event);
    console.log(peerConnection.signalingState);
  });

  peerConnection.addEventListener("icecandidate", (e) => {
    console.log("........Ice candidate found!......");
    console.log(e);
    if (e.candidate) {
      socket.emit("sendIceCandidateToSignalingSocket", {
        iceCandidate: e.candidate,
        iceUserName: userName,
        didIOffer,
        ids: { fromId: ids.toId, toId: ids.fromId },
      });
    }
  });

  peerConnection.addEventListener("track", (e) => {
    console.log("Got a reset track from the other peer!! How excting ");
    console.log(e.streams[0]);
    console.log(e.transceiver);
    let stream1 = e.streams[0];
    console.log(e.streams);
    e.streams[0].onaddtrack = (e) => {
      console.log("added tracks");
    };
    e.streams[0].onremovetrack = (e) => {
      console.log("removed tracks");
    };
    e.transceiver.receiver.track.onmute = (e) => {
      console.log("transceiver.receiver.track.onmute");

      console.log("socket with id: ", remoteId);
      stream1.getTracks().forEach((track) => {
        console.log(track);
        // remoteStream.addTrack(track, remoteStream);
      });
      setTimeout(() => {
        console.log("failed");
        socket.emit("remoteTracksMuted", { fromId: localId, toId: remoteId });
      }, 2500);
      //   socket.emit("remoteTracksMuted", { fromId: localId, toId: remoteId });
    };
    e.transceiver.receiver.track.onended = (e) => {
      console.log("transceiver.receiver.track.onended");
    };
    e.transceiver.receiver.track.onunmute = (e) => {
      console.log("transceiver.receiver.track.onunmute");
      stream1.getTracks().forEach((track) => {
        console.log(track);
        remoteStream.addTrack(track, remoteStream);
        console.log("Here's an exciting moment... fingers cross");
      });
    };
  });

  //   create new offer
  console.log("created new rtc");
  console.log("Creating offer...");
  const offer = await peerConnection.createOffer();
  console.log(offer);
  peerConnection.setLocalDescription(offer);
  didIOffer = true;

  localId = socket.id;
  console.log(localId, "local id here");
  socket.emit("newSingleOffer", {
    offer,
    ids: { fromId: ids.toId, toId: ids.fromId },
  });
});

socket.on("answerSingleOffer", async (data) => {
  console.log("new offer recieved");
  console.log(data);
  localVideoEl.srcObject = null;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    // audio: true,
  });
  localVideoEl.srcObject = stream;
  localStream = stream;

  //   create new rtc
  remoteVideoEl.srcObject = null;
  peerConnection = await new RTCPeerConnection(peerConfiguration);
  remoteStream = new MediaStream();
  remoteVideoEl.srcObject = remoteStream;

  localStream.getTracks().forEach((track) => {
    //add localtracks so that they can be sent once the connection is established
    // peerConnection.addTransceiver(track, { streams: [localStream] });
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.addEventListener("signalingstatechange", (event) => {
    console.log(event);
    console.log(peerConnection.signalingState);
  });

  peerConnection.addEventListener("icecandidate", (e) => {
    console.log("........Ice candidate found!......");
    console.log(e);
    if (e.candidate) {
      socket.emit("sendIceCandidateToSignalingSocket", {
        iceCandidate: e.candidate,
        iceUserName: userName,
        didIOffer,
        ids: { fromId: data.ids.toId, toId: data.ids.fromId },
      });
    }
  });

  peerConnection.addEventListener("track", (e) => {
    console.log("Got a reset track from the other peer!! How excting");
    console.log(e.streams[0]);
    console.log(e.transceiver);
    let stream1 = e.streams[0];
    console.log(e.streams);
    e.streams[0].onaddtrack = (e) => {
      console.log("added tracks");
    };
    e.streams[0].onremovetrack = (e) => {
      console.log("removed tracks");
    };
    e.transceiver.receiver.track.onmute = (e) => {
      console.log("transceiver.receiver.track.onmute");
      console.log("socket with id: ", remoteId);
      stream1.getTracks().forEach((track) => {
        console.log(track);
        // remoteStream.addTrack(track, remoteStream);
      });
      setTimeout(() => {
        console.log("failed");
        socket.emit("remoteTracksMuted", { fromId: localId, toId: remoteId });
      }, 2500);
    };
    e.transceiver.receiver.track.onended = (e) => {
      console.log("transceiver.receiver.track.onended");
    };
    e.transceiver.receiver.track.onunmute = (e) => {
      console.log("transceiver.receiver.track.onunmute");
      stream1.getTracks().forEach((track) => {
        console.log(track);
        remoteStream.addTrack(track, remoteStream);
      });
    };
  });

  await peerConnection.setRemoteDescription(data.offer);
  const answer = await peerConnection.createAnswer({});
  await peerConnection.setLocalDescription(answer);
  data.answer = answer;
  const offerIceCandidates = await socket.emitWithAck("newSingleAnswer", data);
  console.log(offerIceCandidates);
  offerIceCandidates.forEach((c) => {
    peerConnection.addIceCandidate(c);
    console.log("======Added Ice Candidate======");
  });
});
socket.on("addAnswerSdp", async (data) => {
  await peerConnection.setRemoteDescription(data.answer);
  console.log("set answer sdp");
  //   data.answerIce.forEach((iceCandidate) => {
  //     peerConnection.addIceCandidate(iceCandidate);
  //   });
  //   console.log("added new ice candidates");
});
socket.on("addIceAnswerNew", (data) => {
  console.log("brand new ice coming");
  console.log(data);
  console.log(peerConnection.remoteDescription);
  if (peerConnection?.remoteDescription) {
    data.answerIce.forEach((iceCandidate) => {
      peerConnection.addIceCandidate(iceCandidate);
    });
    console.log("added new ice candidates");
  }
});

socket.on("answerScreenOffer", async (data) => {
  console.log("screen offer object");
  console.log(data);
  peerScreenConnection = await new RTCPeerConnection(peerConfiguration);
  remoteScreenStream = new MediaStream();
  RemoteScreenVideoEl.srcObject = remoteScreenStream;
  peerScreenConnection.addEventListener("signalingstatechange", (event) => {
    console.log(event);
    console.log(peerScreenConnection.signalingState);
  });

  peerScreenConnection.addEventListener("icecandidate", (e) => {
    console.log("........screen Ice candidate found!......");
    console.log(e);
    if (e.candidate) {
      console.log(peerIds);
      socket.emit("sendIceCandidateForScreen", {
        iceCandidate: e.candidate,
        didIOfferScreen,
        peerIds,
      });
    }
  });

  peerScreenConnection.addEventListener("track", (e) => {
    console.log("Got a reset screen track from the other peer!! How excting ");
    console.log(e.streams[0]);
    console.log(e.transceiver);
    let stream1 = e.streams[0];
    console.log(e.streams);
    e.streams[0].onaddtrack = (e) => {
      console.log("added tracks");
    };
    e.streams[0].onremovetrack = (e) => {
      console.log("removed tracks");
    };
    e.transceiver.receiver.track.onmute = (e) => {
      console.log("screen transceiver.receiver.track.onmute");
      RemoteScreenVideoEl.srcObject = null;
    };
    e.transceiver.receiver.track.onended = (e) => {
      console.log("screen transceiver.receiver.track.onended");
    };
    e.transceiver.receiver.track.onunmute = (e) => {
      console.log("screen transceiver.receiver.track.onunmute");

      stream1.getTracks().forEach((track) => {
        console.log(track);
        remoteScreenStream.addTrack(track, remoteScreenStream);
      });
    };
  });
  await peerScreenConnection.setRemoteDescription(data.offer);
  const answer = await peerScreenConnection.createAnswer({});
  await peerScreenConnection.setLocalDescription(answer);
  peerIds.fromId = localId;
  peerIds.ids = data.peerIds.ids;
  socket.emit("newScreenAnswer", { answer, peerIds });
});

socket.on("addScreenAnswer", async (data) => {
  console.log("add screen answer");
  await peerScreenConnection.setRemoteDescription(data.answer);
});

socket.on("addScreenIce", (data) => {
  console.log("add screen ice");

  peerScreenConnection.addIceCandidate(data.iceCandidate);
});

socket.on("addRemoteScreenIce", (data) => {
  console.log("add remote screen ice");

  peerScreenConnection.addIceCandidate(data.iceCandidate);
});

function createOfferEls(offers) {
  //make green answer button for this new offer
  const answerEl = document.querySelector("#answer");
  offers.forEach((o) => {
    console.log(o, ".....................................................");
    console.log(o.offerId);
    const newOfferEl = document.createElement("div");
    newOfferEl.innerHTML = `<button class="btn btn-success col-1">Answer ${o.offererUserName}</button>`;
    newOfferEl.addEventListener("click", () => answerOffer(o));
    answerEl.appendChild(newOfferEl);
  });
}

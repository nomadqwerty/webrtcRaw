const userName = "Peer-" + Math.floor(Math.random() * 100000);
const password = "x";
let localId;
let remoteId;
document.querySelector("#user-name").innerHTML = userName;

//if trying it on a phone, use this instead...
// const socket = io.connect('https://LOCAL-DEV-IP-HERE:8181/',{
const socket = io.connect("ws://localhost:8181/", {
  auth: {
    userName,
    password,
  },
});

const localVideoEl = document.querySelector("#local-video");
const localScreenVideoEl = document.querySelector("#screen-video-local");
const RemoteScreenVideoEl = document.querySelector("#screen-video-remote");
const remoteVideoEl = document.querySelector("#remote-video");
const peerIds = {
  fromId: null,
  ids: {},
};

let localStream; //a var to hold the local video stream
let remoteStream; //a var to hold the remote video stream
let localScreenStream; //a var to hold the local video stream
let remoteScreenStream; //a var to hold the remote video stream
let peerConnection; //the peerConnection that the two clients use to talk
let peerScreenConnection; //the peerConnection that the two clients use to talk
let didIOffer = false;
let didIOfferScreen = false;

let peerConfiguration = {
  iceServers: [
    {
      urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
    },
  ],
};

//when a client initiates a call
const call = async (e) => {
  await fetchUserMedia();

  //peerConnection is all set with our STUN servers sent over
  await createPeerConnection();

  //create offer time!
  try {
    console.log("Creating offer...");
    const offer = await peerConnection.createOffer();
    console.log(offer);
    peerConnection.setLocalDescription(offer);
    didIOffer = true;

    localId = socket.id;
    console.log(localId, "local id here");
    socket.emit("newOffer", { offer, offerId: socket.id }); //send offer to signalingServer
  } catch (err) {
    console.log(err);
  }
};

const screenShare = async (e) => {
  // get user display media.
  await fetchDisplayMedia();

  // add screen tracks to peer connection
  peerScreenConnection = await new RTCPeerConnection(peerConfiguration);
  localScreenStream.getVideoTracks().onended = function () {
    console.log("screen share ended");
  };
  localScreenStream.getTracks().forEach((track) => {
    //add localtracks so that they can be sent once the connection is established
    // peerConnection.addTransceiver(track, { streams: [localScreenStream] });
    console.log(track);
    peerScreenConnection.addTrack(track, localScreenStream);
  });

  const offerObject = await socket.emitWithAck("getOfferObject", {
    fromId: localId,
  });

  console.log("....................screens....................");
  console.log(offerObject);

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
  });

  console.log("Creating screen offer...");

  const offer = await peerScreenConnection.createOffer();
  console.log(offer);
  peerScreenConnection.setLocalDescription(offer);
  didIOfferScreen = true;
  peerIds.fromId = localId;
  peerIds.ids.offerId = offerObject.offerId;
  peerIds.ids.answerId = offerObject.answerId;
  socket.emit("newScreenOffer", { offer, peerIds });

  // peerScreenConnection.setLocalDescription(offerObject.offer);
  // offerObject.answererIceCandidates.forEach((ice) => {
  //   console.log("added ice");
  //   peerScreenConnection.addIceCandidate(ice);
  // });
  // await peerScreenConnection.setRemoteDescription(offerObject.answer);

  // socket.emit("renewHandShake", offerObject);

  // notify remote peer of event change.

  // socket.emit("iamSharing", {
  //   fromId: localId,
  // });
};

const answerOffer = async (offerObj) => {
  await fetchUserMedia();
  await createPeerConnection(offerObj);
  const answer = await peerConnection.createAnswer({}); //just to make the docs happy
  await peerConnection.setLocalDescription(answer); //this is CLIENT2, and CLIENT2 uses the answer as the localDesc
  console.log(offerObj);
  localId = socket.id;
  console.log(localId, "local id here");
  console.log(answer);
  remoteId = offerObj.offerId;
  console.log(remoteId, "remote id here");
  // console.log(peerConnection.signalingState) //should be have-local-pranswer because CLIENT2 has set its local desc to it's answer (but it won't be)
  //add the answer to the offerObj so the server knows which offer this is related to
  offerObj.answer = answer;
  offerObj.answerId = localId;
  console.log(offerObj);
  //emit the answer to the signaling server, so it can emit to CLIENT1
  //expect a response from the server with the already existing ICE candidates
  const offerIceCandidates = await socket.emitWithAck("newAnswer", offerObj);
  offerIceCandidates.forEach((c) => {
    peerConnection.addIceCandidate(c);
    console.log("======Added Ice Candidate======");
  });
  console.log(offerIceCandidates);
};

const addAnswer = async (offerObj) => {
  //addAnswer is called in socketListeners when an answerResponse is emitted.
  //at this point, the offer and answer have been exchanged!
  //now CLIENT1 needs to set the remote
  await peerConnection.setRemoteDescription(offerObj.answer);
  // console.log(peerConnection.signalingState)
};

const fetchUserMedia = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        // audio: true,
      });
      localVideoEl.srcObject = stream;
      localStream = stream;
      resolve();
    } catch (err) {
      console.log(err);
      reject();
    }
  });
};
const fetchDisplayMedia = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia();
      // TODO:
      localScreenVideoEl.srcObject = stream;
      localScreenStream = stream;
      resolve();
    } catch (err) {
      console.log(err);
      reject();
    }
  });
};

const createPeerConnection = (offerObj) => {
  return new Promise(async (resolve, reject) => {
    //RTCPeerConnection is the thing that creates the connection
    //we can pass a config object, and that config object can contain stun servers
    //which will fetch us ICE candidates
    peerConnection = await new RTCPeerConnection(peerConfiguration);
    remoteStream = new MediaStream();
    remoteVideoEl.srcObject = remoteStream;

    localStream.getTracks().forEach((track) => {
      //add localtracks so that they can be sent once the connection is established
      //   peerConnection.addTransceiver(track, { streams: [localStream] });
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
        socket.emit("sendIceCandidateToSignalingServer", {
          iceCandidate: e.candidate,
          iceUserName: userName,
          didIOffer,
        });
      }
    });

    peerConnection.addEventListener("track", (e) => {
      console.log("Got a track from the other peer!! How excting");
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
        socket.emit("remoteTracksMuted", { fromId: localId, toId: remoteId });
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
    console.log(peerConnection);
    if (offerObj) {
      //this won't be set when called from call();
      //will be set when we call from answerOffer()
      // console.log(peerConnection.signalingState) //should be stable because no setDesc has been run yet
      await peerConnection.setRemoteDescription(offerObj.offer);
      // console.log(peerConnection.signalingState) //should be have-remote-offer, because client2 has setRemoteDesc on the offer
    }
    resolve();
  });
};

const addNewIceCandidate = (iceCandidate) => {
  peerConnection.addIceCandidate(iceCandidate);
  console.log("======Added Ice Candidate======");
};

document.querySelector("#call").addEventListener("click", call);
document.querySelector("#screen").addEventListener("click", screenShare);

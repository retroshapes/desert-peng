(function () {
  "use strict";

  const config = {
    apiKey: "AIzaSyBlxw4A6HUp3c3ydA1gxQyNfew3VRMuFo8",
    authDomain: "pixel-jumper-43541.firebaseapp.com",
    projectId: "pixel-jumper-43541",
    storageBucket: "pixel-jumper-43541.firebasestorage.app",
    messagingSenderId: "100679285037",
    appId: "1:100679285037:web:a1ac0a00d1c29d3296fba4"
  };

  const collections = {
    normal: "desert_peng_normal_scores",
    hardcore: "desert_peng_hardcore_scores"
  };

  let db;
  let readyPromise;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (window.firebase) resolve();
        else existing.addEventListener("load", resolve, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function initialize() {
    if (readyPromise) return readyPromise;
    readyPromise = loadScript("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js")
      .then(function () {
        return loadScript("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js");
      })
      .then(function () {
        if (!firebase.apps.length) firebase.initializeApp(config);
        db = firebase.firestore();
        return db;
      });
    return readyPromise;
  }

  function getDeviceId() {
    let id = localStorage.getItem("desert_peng_device");
    if (!id) {
      id = "dp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
      localStorage.setItem("desert_peng_device", id);
    }
    return id;
  }

  async function submitScore(name, score, mode) {
    const cleanName = String(name || "").trim().slice(0, 16);
    const cleanScore = Math.max(0, Math.floor(Number(score) || 0));
    const cleanMode = mode === "hardcore" ? "hardcore" : "normal";
    if (!cleanName) throw new Error("Enter a name");

    const lastSubmit = Number(localStorage.getItem("desert_peng_last_submit") || 0);
    if (Date.now() - lastSubmit < 8000) throw new Error("Please wait a moment");

    await initialize();
    await db.collection(collections[cleanMode]).add({
      name: cleanName,
      score: cleanScore,
      mode: cleanMode,
      deviceId: getDeviceId(),
      timestamp: Date.now()
    });
    localStorage.setItem("desert_peng_last_submit", String(Date.now()));
  }

  async function getScores(mode, limit) {
    const cleanMode = mode === "hardcore" ? "hardcore" : "normal";
    await initialize();
    const snapshot = await db.collection(collections[cleanMode])
      .orderBy("score", "desc")
      .limit(limit || 20)
      .get();
    return snapshot.docs.map(function (doc) {
      return Object.assign({ id: doc.id }, doc.data());
    });
  }

  window.desertPengFirebase = {
    initialize: initialize,
    submitScore: submitScore,
    getScores: getScores
  };
})();

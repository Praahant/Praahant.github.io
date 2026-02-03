/* ================= FIREBASE IMPORTS ================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  getDocs,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================= INIT ================= */
const app = initializeApp({
  apiKey: "AIzaSyCcdi8fiymbvtRHtMkqeKniIcDzx2X2Ftw",
  authDomain: "minimaltodo-539fb.firebaseapp.com",
  projectId: "minimaltodo-539fb"
});

const auth = getAuth(app);
const db = getFirestore(app);

/* ================= DOM ================= */
const authSection = document.getElementById("authSection");
const appSection = document.getElementById("app");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userName = document.getElementById("userName");

const taskText = document.getElementById("taskText");
const taskTime = document.getElementById("taskTime");
const addTaskBtn = document.getElementById("addTask");
const taskList = document.getElementById("taskList");
const leaderboard = document.getElementById("leaderboard");

const friendInput = document.getElementById("friendUsername");
const addFriendBtn = document.getElementById("addFriend");
const friendsTasks = document.getElementById("friendsTasks");

/* ================= STATE ================= */
let currentUser;
let usernameMap = {};
const timers = {};

// friends


/* ================= HELPERS ================= */
const todayKey = () => new Date().toISOString().split("T")[0];

const weekKeys = () => {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
};

/* ================= AUTH ================= */
loginBtn.onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
logoutBtn.onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    authSection.style.display = "block";
    appSection.style.display = "none";
    return;
  }

  currentUser = user;
  authSection.style.display = "none";
  appSection.style.display = "block";

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    let username;
    while (!username) {
      username = prompt("Choose unique username").trim().toLowerCase();
    }
    await setDoc(ref, { uid: user.uid, username });
  }

  userName.innerText = (await getDoc(ref)).data().username;

  await loadUsernameMap();
  loadFriends();
  autoMissTasks();
  loadTasks();
  loadLeaderboard();
  
});

/* ================= TASKS ================= */
addTaskBtn.onclick = async () => {
  const text = taskText.value.trim();
  if (!text) return;

  const mins = Number(taskTime.value);
  await addDoc(collection(db, "tasks"), {
    uid: currentUser.uid,
    text,
    duration: mins ? mins * 60 : null,
    remaining: mins ? mins * 60 : null,
    running: false,
    status: "pending",
    day: todayKey(),
    createdAt: serverTimestamp()
  });

  taskText.value = "";
  taskTime.value = "";
};

function loadTasks() {
  const q = query(
    collection(db, "tasks"),
    where("uid", "==", currentUser.uid),
    where("day", "==", todayKey())
  );

  onSnapshot(q, snap => {
    taskList.innerHTML = "";
    snap.forEach(d => renderTask(d));
  });
}

function renderTask(docSnap) {
  const t = docSnap.data();
  const div = document.createElement("div");
  div.className = `task ${t.status}`;

  div.innerHTML = `
    <strong>${t.text}</strong><br>
    ${t.duration ? `<span>${t.remaining}s</span>` : ""}
    ${t.status === "pending" && t.duration ? `<button>${t.running ? "Pause" : "Start"}</button>` : ""}
  `;

  const btn = div.querySelector("button");
  if (btn) {
    btn.onclick = () => t.running
      ? pauseTimer(docSnap.id)
      : startTimer(docSnap.id, t.remaining);
  }

  taskList.appendChild(div);
}

function startTimer(id, seconds) {
  clearInterval(timers[id]);
  updateDoc(doc(db, "tasks", id), { running: true });

  timers[id] = setInterval(async () => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(timers[id]);
      await updateDoc(doc(db, "tasks", id), {
        remaining: 0,
        running: false,
        status: "completed"
      });
    } else {
      await updateDoc(doc(db, "tasks", id), { remaining: seconds });
    }
  }, 1000);
}

function pauseTimer(id) {
  clearInterval(timers[id]);
  updateDoc(doc(db, "tasks", id), { running: false });
}

/* ================= AUTO MISS ================= */
async function autoMissTasks() {
  const q = query(
    collection(db, "tasks"),
    where("uid", "==", currentUser.uid),
    where("status", "==", "pending")
  );

  const snap = await getDocs(q);
  snap.forEach(d => {
    if (d.data().day !== todayKey()) {
      updateDoc(d.ref, { status: "missed", running: false });
    }
  });
}

/* ================= FRIENDS ================= */
addFriendBtn.onclick = async () => {
  const username = friendInput.value.trim().toLowerCase();
  if (!username || !currentUser) return;

  // find user by username
  const q = query(
    collection(db, "users"),
    where("username", "==", username)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    alert("User not found");
    return;
  }

  const friendDoc = snap.docs[0];
  const friendUid = friendDoc.id;

  if (friendUid === currentUser.uid) {
    alert("You cannot add yourself");
    return;
  }

  await setDoc(
    doc(db, "users", currentUser.uid, "friends", friendUid),
    {
      uid: friendUid,
      addedAt: serverTimestamp()
    }
  );

  friendInput.value = "";
  loadFriends(); // refresh UI
};

async function loadFriends() {
  friendsTasks.innerHTML = "<div class='small'>Friends</div>";

  const snap = await getDocs(
    collection(db, "users", currentUser.uid, "friends")
  );

  if (snap.empty) {
    friendsTasks.innerHTML += "<div class='small'>No friends yet</div>";
    return;
  }

  snap.forEach((d) => {
    const uid = d.data().uid;
    const name = usernameMap[uid] ?? "unknown";

    const div = document.createElement("div");
    div.className = "small";
    div.innerText = `👤 ${name}`;
    friendsTasks.appendChild(div);
  });
}


/* ================= USERNAME MAP ================= */
async function loadUsernameMap() {
  const snap = await getDocs(collection(db, "users"));
  usernameMap = {};
  snap.forEach(d => usernameMap[d.id] = d.data().username);
}

/* ================= LEADERBOARD ================= */
function loadLeaderboard() {
  const q = query(collection(db, "tasks"));
  onSnapshot(q, snap => {
    const stats = {};

    snap.forEach(d => {
      const t = d.data();
      const s = stats[t.uid] ??= { c: 0, m: 0, time: 0 };
      if (t.status === "completed") {
        s.c++;
        s.time += t.duration ?? 0;
      }
      if (t.status === "missed") s.m++;
    });

    leaderboard.innerHTML = "";
    Object.entries(stats).forEach(([uid, s]) => {
      const div = document.createElement("div");
      div.innerText = `${usernameMap[uid]} ⏱ ${Math.floor(s.time/60)}m ✅ ${s.c} ❌ ${s.m}`;
      leaderboard.appendChild(div);
    });
  });
}

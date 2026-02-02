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

/* ================= CONFIG ================= */
const firebaseConfig = {
    apiKey: "AIzaSyCcdi8fiymbvtRHtMkqeKniIcDzx2X2Ftw",
    authDomain: "minimaltodo-539fb.firebaseapp.com",
    projectId: "minimaltodo-539fb",
    storageBucket: "minimaltodo-539fb.firebasestorage.app",
    messagingSenderId: "850265669107",
    appId: "1:850265669107:web:e94126febdfb5f8bc62686"
  };

/* ================= INIT ================= */
const app = initializeApp(firebaseConfig);
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

/* ================= STATE ================= */
let currentUser = null;
const timers = {};
let usernameMap = {};

/* ================= HELPERS ================= */
function todayKey() {
  const d = new Date();
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

/* ================= AUTH ================= */
loginBtn.onclick = async () => {
  await signInWithPopup(auth, new GoogleAuthProvider());
};

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

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  // 🔑 Set username once
  if (!snap.exists() || !snap.data().username) {
    let username;
    while (!username) {
      username = prompt("Choose a username")
        ?.toLowerCase()
        .trim();
    }

    await setDoc(userRef, {
      uid: user.uid,
      username,
      createdAt: serverTimestamp()
    });
  }

  const finalSnap = await getDoc(userRef);
  userName.innerText = finalSnap.data().username;

  await loadUsernameMap();
  loadTasks();
  loadLeaderboard();
});

/* ================= TASKS ================= */
addTaskBtn.onclick = async () => {
  const text = taskText.value.trim();
  if (!text || !currentUser) return;

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

  onSnapshot(q, (snap) => {
    taskList.innerHTML = "";

    snap.forEach((docSnap) => {
      const t = docSnap.data();
      const div = document.createElement("div");
      div.className = `task ${t.status}`;

      div.innerHTML = `
        <strong>${t.text}</strong><br>
        ${
          t.duration
            ? `<span class="small">${t.remaining}s</span>`
            : ""
        }
        ${
          t.duration && t.status === "pending"
            ? `<button>${t.running ? "Pause" : "Start"}</button>`
            : ""
        }
      `;

      // ▶️ Start / ⏸ Pause logic
      if (t.duration && t.status === "pending") {
        const btn = div.querySelector("button");

        btn.onclick = async () => {
          if (t.running) {
            pauseTimer(docSnap.id);
          } else {
            startTimer(docSnap.id, t.remaining);
          }
        };
      }

      taskList.appendChild(div);
    });
  });
}
function pauseTimer(taskId) {
  clearInterval(timers[taskId]);

  updateDoc(doc(db, "tasks", taskId), {
    running: false
  });
}
function startTimer(taskId, seconds) {
  clearInterval(timers[taskId]);

  updateDoc(doc(db, "tasks", taskId), {
    running: true
  });

  timers[taskId] = setInterval(async () => {
    seconds--;

    await updateDoc(doc(db, "tasks", taskId), {
      remaining: seconds
    });

    if (seconds <= 0) {
      clearInterval(timers[taskId]);
      await updateDoc(doc(db, "tasks", taskId), {
        status: "completed",
        running: false
      });
    }
  }, 1000);
}


/* ================= USERNAME MAP ================= */
async function loadUsernameMap() {
  const snap = await getDocs(collection(db, "users"));
  usernameMap = {};
  snap.forEach(d => {
    const u = d.data();
    usernameMap[u.uid] = u.username;
  });
}

/* ================= LEADERBOARD ================= */
function loadLeaderboard() {
  const q = query(
    collection(db, "tasks"),
    where("day", "==", todayKey())
  );

  onSnapshot(q, (snap) => {
    const stats = {};

    snap.forEach((d) => {
      const t = d.data();
      stats[t.uid] ??= { completed: 0, missed: 0 };
      if (t.status === "completed") stats[t.uid].completed++;
      if (t.status === "missed") stats[t.uid].missed++;
    });

    leaderboard.innerHTML = "";
    Object.entries(stats).forEach(([uid, s]) => {
      const div = document.createElement("div");
      const name = usernameMap[uid] ?? "unknown";
      div.innerText = `${name}  ✅ ${s.completed} ❌ ${s.missed}`;
      leaderboard.appendChild(div);
    });
  });
}

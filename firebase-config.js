import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAGcY_JS0kFOnI1OWbHKbRv-Tyx8uA2Rbk",
  authDomain: "random-bsyoshi.firebaseapp.com",
  projectId: "random-bsyoshi",
  storageBucket: "random-bsyoshi.firebasestorage.app",
  messagingSenderId: "857877222212",
  appId: "1:857877222212:web:fb6caf3d185bc003c13d11",
  measurementId: "G-RJEJP9JE3Y"
};

// Initialize Firebase and export Firestore
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyA78OwJGC3Wt3l8UOBvH4tqEom8W4o3qII",
    authDomain: "web-alvaro-inmo.firebaseapp.com",
    projectId: "web-alvaro-inmo",
    storageBucket: "web-alvaro-inmo.firebasestorage.app", // <-- ESTA ES LA LÍNEA CORRECTA
    messagingSenderId: "380224636452",
    appId: "1:380224636452:web:def2556143a2a0423ffab1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Lógica para alternar vistas
const loginView = document.getElementById('login-view');
const registerView = document.getElementById('register-view');
const showRegisterBtn = document.getElementById('show-register');
const showLoginBtn = document.getElementById('show-login');
const errorMessage = document.getElementById('error-message');

showRegisterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loginView.classList.add('hidden');
    registerView.classList.remove('hidden');
    errorMessage.textContent = '';
});

showLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    registerView.classList.add('hidden');
    loginView.classList.remove('hidden');
    errorMessage.textContent = '';
});

// Lógica de Registro
document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            redirectToCalculator();
        })
        .catch((error) => {
            errorMessage.textContent = "Error al registrar: " + error.message;
        });
});

// Lógica de Inicio de Sesión
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            redirectToCalculator();
        })
        .catch((error) => {
            errorMessage.textContent = "Error al iniciar sesión: " + error.message;
        });
});

function redirectToCalculator() {
    const params = new URLSearchParams(window.location.search);
    const redirectUrl = params.get('redirect');
    window.location.href = redirectUrl || 'index.html';
}

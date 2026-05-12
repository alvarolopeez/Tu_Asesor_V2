import { initializeApp } from "https://www.gstatic.com/firebasejs/9.16.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/9.16.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA78OwJGC3Wt3l8UOBvH4tqEom8W4o3qII",
    authDomain: "web-alvaro-inmo.firebaseapp.com",
    projectId: "web-alvaro-inmo",
    storageBucket: "web-alvaro-inmo.firebasestorage.app",
    messagingSenderId: "380224636452",
    appId: "1:380224636452:web:def2556143a2a0423ffab1",
    measurementId: "G-8M3LPYJXP7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Lógica para Menú Móvil
const mobileMenuButton = document.getElementById('mobile-menu-button');
const closeMenuButton = document.getElementById('close-menu-button');
const mobileMenu = document.getElementById('mobile-menu');
if (mobileMenuButton) mobileMenuButton.addEventListener('click', () => { mobileMenu.classList.remove('hidden'); });
if (closeMenuButton) closeMenuButton.addEventListener('click', () => { mobileMenu.classList.add('hidden'); });

// --- Contact Form Logic ---
const contactForm = document.getElementById('contact-form');
const contactSuccess = document.getElementById('contact-success');
const contactError = document.getElementById('contact-error');

if (contactForm) {
    contactForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const submitButton = contactForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Enviando...';
        contactSuccess.classList.add('hidden');
        contactError.classList.add('hidden');

        const formData = {
            name: document.getElementById('contact-name').value,
            email: document.getElementById('contact-email').value,
            phone: document.getElementById('contact-phone').value,
            message: document.getElementById('contact-message').value,
            timestamp: new Date()
        };

        try {
            await addDoc(collection(db, "contactMessages"), formData);
            contactForm.reset();
            contactSuccess.classList.remove('hidden');
        } catch (e) {
            console.error("Error al enviar el mensaje de contacto: ", e);
            contactError.classList.remove('hidden');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Enviar mensaje';
        }
    });
}

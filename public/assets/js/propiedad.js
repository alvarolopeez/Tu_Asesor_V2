import { initializeApp } from "https://www.gstatic.com/firebasejs/9.16.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.16.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA78OwJGC3Wt3l8UOBvH4tqEom8W4o3qII",
    authDomain: "web-alvaro-inmo.firebaseapp.com",
    projectId: "web-alvaro-inmo",
    storageBucket: "web-alvaro-inmo.firebasestorage.app",
    messagingSenderId: "380224636452",
    appId: "1:380224636452:web:def2556143a2a0423ffab1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- Lógica del Menú Móvil ---
const mobileMenuButton = document.getElementById('mobile-menu-button');
const closeMenuButton = document.getElementById('close-menu-button');
const mobileMenu = document.getElementById('mobile-menu');
if (mobileMenuButton) mobileMenuButton.addEventListener('click', () => mobileMenu.classList.remove('hidden'));
if (closeMenuButton) closeMenuButton.addEventListener('click', () => mobileMenu.classList.add('hidden'));

// --- Lógica para Cargar los Datos del Inmueble ---
const loadingDiv = document.getElementById('loading-state');
const contentDiv = document.getElementById('content-state');
const errorDiv = document.getElementById('error-state');

async function loadProperty() {
    const urlParams = new URLSearchParams(window.location.search);
    const propertyId = urlParams.get('id');
    if (!propertyId) { loadingDiv.style.display = 'none'; errorDiv.style.display = 'block'; return; }

    try {
        const docRef = doc(db, "properties", propertyId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const property = docSnap.data();
            const imageUrls = property.images || [];

            document.title = `${property.title} | Tu Asesor Álvaro`;
            document.getElementById('property-title').textContent = property.title;
            document.getElementById('property-price').textContent = property.price.toLocaleString('es-ES') + (property.operation === 'alquilar' ? ' €/mes' : ' €');
            document.getElementById('property-specs').innerHTML = `${property.beds > 0 ? `<span>🛏️ ${property.beds} hab.</span>` : ''} ${property.baths > 0 ? `<span>🛁 ${property.baths} baños</span>` : ''} <span>📏 ${property.sqm} m²</span>`;
            document.getElementById('property-description').innerHTML = property.description;
            document.getElementById('property-map').src = `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3170.189505704153!2d-5.98616068469333!3d37.38573677983177!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd126c0b1f3a0a0b%3A0x8f35a09c20a1c3d1!2sAv.%20de%20la%20Constitución%2C%20Sevilla!5e0!3m2!1ses!2ses!4v1663186210134!5m2!1ses!2ses`;

            const mainGalleryWrapper = document.getElementById('main-gallery-wrapper');
            const thumbGalleryWrapper = document.getElementById('thumbnail-gallery-wrapper');

            mainGalleryWrapper.innerHTML = '';
            thumbGalleryWrapper.innerHTML = '';

            imageUrls.forEach(imgUrl => {
                mainGalleryWrapper.innerHTML += `<div class="swiper-slide"><img src="${imgUrl}" class="w-full h-auto max-h-[600px] object-contain"></div>`;
                thumbGalleryWrapper.innerHTML += `<div class="swiper-slide"><img src="${imgUrl}"></div>`;
            });

            const galleryThumbs = new Swiper(".gallery-thumbs", {
                spaceBetween: 10,
                slidesPerView: 5,
                freeMode: true,
                watchSlidesProgress: true,
            });
            const galleryTop = new Swiper(".gallery-top", {
                spaceBetween: 10,
                navigation: {
                    nextEl: ".swiper-button-next",
                    prevEl: ".swiper-button-prev",
                },
                thumbs: { swiper: galleryThumbs },
            });

            loadingDiv.style.display = 'none';
            contentDiv.style.display = 'block';
        } else {
            loadingDiv.style.display = 'none'; errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error("Error al cargar el inmueble:", error);
        loadingDiv.style.display = 'none'; errorDiv.style.display = 'block';
    }
}

loadProperty();

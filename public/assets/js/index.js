import { initializeApp } from "https://www.gstatic.com/firebasejs/9.16.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.16.0/firebase-firestore.js";

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

// --- LÓGICA PARA EL FORMULARIO DE VALORACIÓN ---
const valuationForm = document.getElementById('valuation-form');
if (valuationForm) {
    valuationForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const submitButton = valuationForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Enviando...';

        const formData = {
            nombre: document.getElementById('name').value,
            telefono: document.getElementById('phone').value,
            email: document.getElementById('email').value,
            ciudad: document.getElementById('city').value,
            codigoPostal: document.getElementById('zipcode').value,
            direccion: document.getElementById('address').value,
            descripcion: document.getElementById('description').value,
            fechaSolicitud: serverTimestamp()
        };

        try {
            await addDoc(collection(db, "solicitudesValoracion"), formData);
            document.getElementById('valuation-form-container').style.display = 'none';
            document.getElementById('success-message').classList.remove('hidden');
        } catch (e) {
            console.error("Error al añadir la solicitud de valoración: ", e);
            alert("Hubo un error al enviar tu solicitud. Por favor, inténtalo de nuevo.");
            submitButton.disabled = false;
            submitButton.textContent = 'Solicitar valoración';
        }
    });
}

// --- LÓGICA PARA EL POP-UP DE COMPRADORES ---
const buyerForm = document.getElementById('buyer-form');
if (buyerForm) {
    buyerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = buyerForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Enviando...';

        const buyerData = {
            nombre: document.getElementById('popup-name').value,
            telefono: document.getElementById('popup-phone').value,
            email: document.getElementById('popup-email').value,
            fechaRegistro: serverTimestamp()
        };

        try {
            await addDoc(collection(db, "contactosCompradores"), buyerData);
            document.getElementById('popup-form-content').classList.add('hidden');
            document.getElementById('popup-success-message').classList.remove('hidden');
            setTimeout(() => {
                const buyerPopup = document.getElementById('buyer-popup');
                if (buyerPopup) buyerPopup.classList.add('hidden');
                sessionStorage.setItem('popupClosed', 'true');
            }, 3000);
        } catch (e) {
            console.error("Error al registrar el contacto del comprador: ", e);
            alert("Hubo un error al registrar tus datos. Por favor, inténtalo de nuevo.");
            submitButton.disabled = false;
            submitButton.textContent = '¡Quiero enterarme!';
        }
    });
}

// --- LÓGICA PARA EL CARRUSEL DE PROPIEDADES EN VENTA ---
const forSaleWrapper = document.getElementById('for-sale-swiper-wrapper');
const forSaleContainer = document.getElementById('for-sale-carousel-container');
const noForSaleMessage = document.getElementById('no-for-sale-message');

async function loadForSale() {
    try {
        const q = query(collection(db, "properties"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        const forSaleProperties = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (forSaleProperties && forSaleProperties.length > 0) {
            forSaleContainer.classList.remove('hidden');
            noForSaleMessage.classList.add('hidden');
            forSaleProperties.forEach(p => {
                const priceFormatted = p.price.toLocaleString('es-ES') + (p.operation === 'alquilar' ? ' €/mes' : ' €');
                const card = `
                    <div class="swiper-slide">
                        <div class="bg-white rounded-lg shadow-md overflow-hidden text-left property-card h-full">
                            <a href="propiedad.html?id=${p.id}" class="block">
                                <div class="relative">
                                    <img src="${p.images && p.images[0] ? p.images[0] : ''}" alt="${p.title}" class="w-full h-56 object-cover">
                                    ${p.tag ? `<div class="absolute top-4 left-4 bg-[#587C9A] text-white text-sm font-bold px-3 py-1 rounded">${p.tag}</div>` : ''}
                                </div>
                                <div class="p-6">
                                    <p class="text-2xl font-bold text-[#2C3E50]">${priceFormatted}</p>
                                    <h3 class="text-xl font-bold mt-2 truncate">${p.title}</h3>
                                    <div class="flex items-center mt-4 text-gray-600 space-x-4">
                                        ${p.beds > 0 ? `<span>🛏️ ${p.beds} hab.</span>` : ''}
                                        ${p.baths > 0 ? `<span>🛁 ${p.baths} baños</span>` : ''}
                                        <span>📏 ${p.sqm} m²</span>
                                    </div>
                                </div>
                            </a>
                        </div>
                    </div>`;
                forSaleWrapper.innerHTML += card;
            });

            new Swiper(".forSaleSwiper", {
                loop: forSaleProperties.length > 2, slidesPerView: 1, spaceBetween: 16,
                navigation: { nextEl: ".for-sale-swiper-next", prevEl: ".for-sale-swiper-prev" },
                pagination: { el: ".forSaleSwiper .swiper-pagination", clickable: true },
                breakpoints: { 640: { slidesPerView: 2 }, 1024: { slidesPerView: 3 } },
            });
        } else {
            forSaleContainer.classList.add('hidden');
            noForSaleMessage.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Error cargando propiedades para el carrusel: ", error);
        forSaleContainer.classList.add('hidden');
        noForSaleMessage.classList.remove('hidden');
    }
}

// --- LÓGICA PARA RESEÑAS (NUEVO) ---
const reviewsContainer = document.getElementById('reviews-container');
const addReviewBtn = document.getElementById('add-review-btn');
const reviewPopup = document.getElementById('review-popup');
const closeReviewPopupBtn = document.getElementById('close-review-popup-btn');
const reviewForm = document.getElementById('review-form');

// Función para renderizar estrellas
function renderStars(rating) {
    let starsHTML = '';
    for (let i = 1; i <= 5; i++) {
        starsHTML += `<span class="star ${i <= rating ? 'filled' : ''}">★</span>`;
    }
    return starsHTML;
}

// Cargar y mostrar reseñas aprobadas en el carrusel
async function loadReviews() {
    const swiperWrapper = document.getElementById('reviews-swiper-wrapper');
    const carouselContainer = document.getElementById('reviews-carousel-container');

    try {
        const q = query(collection(db, "reviews"), where("approved", "==", true), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        swiperWrapper.innerHTML = ''; // Limpiar el contenedor del carrusel

        if (snapshot.empty) {
            carouselContainer.innerHTML = '<p class="text-gray-500">Aún no hay reseñas. ¡Sé el primero en dejar una!</p>';
            return;
        }

        snapshot.forEach(doc => {
            const review = doc.data();
            const reviewSlide = `
                <div class="swiper-slide h-auto">
                    <div class="review-card p-6 rounded-lg text-left shadow-lg flex flex-col h-full">
                        <div class="flex items-center mb-4">
                            <div class="w-12 h-12 rounded-full bg-gray-500 flex items-center justify-center text-xl font-bold mr-4 flex-shrink-0">
                                ${review.name.charAt(0)}
                            </div>
                            <div>
                                <p class="font-bold text-lg">${review.name}</p>
                                <div class="star-rating text-lg">${renderStars(review.rating)}</div>
                            </div>
                        </div>
                        <p class="text-gray-300 flex-grow">“${review.text}”</p>
                    </div>
                </div>
            `;
            swiperWrapper.innerHTML += reviewSlide;
        });

        // Inicializar Swiper DESPUÉS de cargar las reseñas
        new Swiper(".testimonialsSwiper", {
            loop: snapshot.docs.length > 3, // El loop solo funciona si hay más slides que las visibles
            slidesPerView: 1, // Por defecto (móviles)
            spaceBetween: 30,
            autoplay: {
                delay: 5000,
                disableOnInteraction: false, // El autoplay no se detiene si el usuario interactúa
            },
            pagination: {
                el: ".testimonialsSwiper .swiper-pagination",
                clickable: true,
            },
            navigation: {
                nextEl: ".testimonials-swiper-next",
                prevEl: ".testimonials-swiper-prev",
            },
            // Breakpoints para la vista en ordenador
            breakpoints: {
                // Cuando la pantalla sea >= 1024px
                1024: {
                    slidesPerView: 3,
                    spaceBetween: 30
                }
            }
        });

    } catch (error) {
        console.error("Error al cargar las reseñas:", error);
        carouselContainer.innerHTML = '<p class="text-red-500">No se pudieron cargar las reseñas en este momento.</p>';
    }
}

// Abrir/cerrar pop-up de reseña
addReviewBtn.addEventListener('click', () => reviewPopup.classList.remove('hidden'));
closeReviewPopupBtn.addEventListener('click', () => reviewPopup.classList.add('hidden'));

// Enviar formulario de reseña
reviewForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = reviewForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Enviando...';

    const rating = reviewForm.querySelector('input[name="rating"]:checked');
    if (!rating) {
        alert('Por favor, selecciona una valoración de 1 a 5 estrellas.');
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar reseña';
        return;
    }

    const reviewData = {
        name: document.getElementById('review-name').value,
        text: document.getElementById('review-text').value,
        rating: parseInt(rating.value),
        approved: false, // Las reseñas necesitan aprobación
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "reviews"), reviewData);
        document.getElementById('review-form-content').classList.add('hidden');
        document.getElementById('review-success-message').classList.remove('hidden');
        setTimeout(() => {
            reviewPopup.classList.add('hidden');
            // Resetear el formulario para la próxima vez
            document.getElementById('review-form-content').classList.remove('hidden');
            document.getElementById('review-success-message').classList.add('hidden');
            reviewForm.reset();
            submitButton.disabled = false;
            submitButton.textContent = 'Enviar reseña';
        }, 4000);
    } catch (error) {
        console.error("Error al enviar la reseña: ", error);
        alert('Hubo un error al enviar tu reseña. Inténtalo de nuevo.');
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar reseña';
    }
});

// Cargar reseñas al iniciar la página
loadReviews();

// Cargar propiedades en venta al iniciar la página
loadForSale();


// DOM scripts (no-module) moved to same file but will be executed as part of module for convenience

document.addEventListener('DOMContentLoaded', () => {
    // Lógica para Menú Móvil
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const closeMenuButton = document.getElementById('close-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenuButton) mobileMenuButton.addEventListener('click', () => { mobileMenu.classList.remove('hidden'); });
    if (closeMenuButton) closeMenuButton.addEventListener('click', () => { mobileMenu.classList.add('hidden'); });

    // Lógica para "Leer más"
    const readMoreButton = document.getElementById('read-more-button');
    const expandableContent = document.getElementById('expandable-content');
    readMoreButton.addEventListener('click', () => {
        expandableContent.classList.toggle('expanded');
        readMoreButton.textContent = expandableContent.classList.contains('expanded') ? 'Leer menos' : 'Leer más';
    });

    // Lógica del Carrusel de Propiedades Vendidas
    var soldSwiper = new Swiper(".soldSwiper", {
        loop: true,
        slidesPerView: 1,
        slidesPerGroup: 1,
        spaceBetween: 16,
        navigation: {
            nextEl: ".sold-swiper-next",
            prevEl: ".sold-swiper-prev",
        },
        pagination: {
            el: ".soldSwiper .swiper-pagination",
            clickable: true,
        },
        breakpoints: {
            640: { slidesPerView: 2, slidesPerGroup: 2, spaceBetween: 30 },
            1024: { slidesPerView: 3, slidesPerGroup: 3, spaceBetween: 30 },
        },
    });

    // Lógica para el Pop-up de Compradores
    const buyerPopup = document.getElementById('buyer-popup');
    const closePopupButton = document.getElementById('close-popup-btn');

    setTimeout(() => {
        if (!sessionStorage.getItem('popupClosed')) {
            buyerPopup.classList.remove('hidden');
        }
    }, 5000);

    function closePopup() {
        buyerPopup.classList.add('hidden');
        sessionStorage.setItem('popupClosed', 'true');
    }

    closePopupButton.addEventListener('click', closePopup);

    // --- LÓGICA PARA EL BANNER DE COOKIES ---
    const cookieBanner = document.getElementById('cookie-banner');
    const acceptButton = document.getElementById('accept-cookies-btn');

    // Comprobar si el consentimiento ya fue dado
    if (!localStorage.getItem('cookiesAccepted')) {
        // Si no ha aceptado, mostramos el banner
        setTimeout(() => {
            cookieBanner.classList.add('visible');
        }, 1000); // Pequeña espera para no mostrarlo de golpe
    }

    // Evento al hacer clic en el botón de aceptar
    acceptButton.addEventListener('click', () => {
        // Guardar la preferencia en el almacenamiento local del navegador
        localStorage.setItem('cookiesAccepted', 'true');

        // Ocultar el banner con la animación
        cookieBanner.classList.remove('visible');
    });
});

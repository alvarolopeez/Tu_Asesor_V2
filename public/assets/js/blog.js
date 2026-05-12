import { initializeApp } from "https://www.gstatic.com/firebasejs/9.16.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/9.16.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA78OwJGC3Wt3l8UOBvH4tqEom8W4o3qII",
    authDomain: "web-alvaro-inmo.firebaseapp.com",
    projectId: "web-alvaro-inmo",
    storageBucket: "web-alvaro-inmo.firebasestorage.app", // <-- ESTA ES LA LÍNEA CORRECTA
    messagingSenderId: "380224636452",
    appId: "1:380224636452:web:def2556143a2a0423ffab1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const grid = document.getElementById('posts-grid');
const paginationControls = document.getElementById('pagination-controls');
const loadingState = document.getElementById('loading-state');
const POSTS_PER_PAGE = 12;
let allPosts = [];

function getTextFromHtml(html, maxLength = 120) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    let text = tempDiv.textContent || tempDiv.innerText || "";
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

async function loadPosts() {
    try {
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        allPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        loadingState.classList.add('hidden');

        if (allPosts.length === 0) {
            grid.innerHTML = '<p class="text-center col-span-full">No hay entradas en el blog todavía.</p>';
            return;
        }

        renderPage(1);
        setupPagination();
    } catch (error) {
        console.error("Error al cargar los posts:", error);
        loadingState.textContent = "Error al cargar las entradas.";
    }
}

function renderPage(pageNumber) {
    grid.innerHTML = '';
    const startIndex = (pageNumber - 1) * POSTS_PER_PAGE;
    const endIndex = startIndex + POSTS_PER_PAGE;
    const pagePosts = allPosts.slice(startIndex, endIndex);

    pagePosts.forEach(p => {
        const date = p.createdAt?.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) || '';
        const excerpt = getTextFromHtml(p.contentHtml);
        grid.innerHTML += `
			<a href="lectura.html?id=${p.id}" class="post-card bg-white rounded-lg shadow overflow-hidden flex flex-col">
				<img src="${p.featuredImage || 'https://via.placeholder.com/400x300.png?text=Sin+Imagen'}" alt="${p.title}" class="w-full h-48 object-cover">
				<div class="p-6 flex flex-col flex-grow">
					<div class="text-sm text-gray-500 mb-2">
						<span>📅 ${date}</span>
						<span class="ml-2">✒️ Tu Asesor | Álvaro</span>
					</div>
					<h3 class="text-xl font-bold mb-2 text-gray-800 flex-grow">${p.title}</h3>
					<p class="text-gray-600 mb-4 text-sm">${excerpt}</p>
					<span class="mt-auto text-blue-600 font-semibold hover:underline">Sigue leyendo</span>
				</div>
			</a>`;
    });

    document.querySelectorAll('#pagination-controls button').forEach((btn) => {
        btn.classList.toggle('active', parseInt(btn.textContent) === pageNumber);
    });
}

function setupPagination() {
    const pageCount = Math.ceil(allPosts.length / POSTS_PER_PAGE);
    paginationControls.innerHTML = '';
    if (pageCount <= 1) return;

    for (let i = 1; i <= pageCount; i++) {
        const button = document.createElement('button');
        button.textContent = i;
        button.className = 'pagination-btn';
        button.onclick = () => renderPage(i);
        paginationControls.appendChild(button);
    }
}

loadPosts();

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

// --- Lógica del Catálogo de Propiedades ---
const grid = document.getElementById('property-grid');
const noResults = document.getElementById('no-results');
const resultsCount = document.getElementById('results-count');
const paginationControls = document.getElementById('pagination-controls');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');

let allProperties = [];
let filteredProperties = [];
let currentPage = 1;
const PROPERTIES_PER_PAGE = 9;

const filters = { operation: 'comprar', type: 'todos', minPrice: null, maxPrice: null, sortBy: 'createdAt-desc' };

async function fetchAllProperties() {
    try {
        resultsCount.textContent = 'Cargando propiedades...';
        const q = query(collection(db, "properties"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        allProperties = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyFiltersAndRender();
    } catch (error) {
        console.error("Error al cargar propiedades: ", error);
        resultsCount.textContent = 'Error al cargar las propiedades. Revisa la configuración de Firebase.';
    }
}

function applyFiltersAndRender() {
    filteredProperties = allProperties.filter(p =>
        (p.operation === filters.operation) &&
        (filters.type === 'todos' || p.type === filters.type) &&
        (filters.minPrice === null || p.price >= filters.minPrice) &&
        (filters.maxPrice === null || p.price <= filters.maxPrice)
    );

    const [sortField, sortDirection] = filters.sortBy.split('-');
    filteredProperties.sort((a, b) => {
        const valA = a[sortField]?.seconds || a[sortField];
        const valB = b[sortField]?.seconds || b[sortField];
        if (sortDirection === 'asc') return valA > valB ? 1 : -1;
        return valB > valA ? 1 : -1;
    });
    currentPage = 1;
    renderPage();
}

function renderPage() {
    grid.innerHTML = '';
    noResults.classList.toggle('hidden', filteredProperties.length === 0);
    resultsCount.textContent = `Mostrando ${filteredProperties.length} propiedades.`;

    const totalPages = Math.ceil(filteredProperties.length / PROPERTIES_PER_PAGE);
    paginationControls.style.display = totalPages > 1 ? 'flex' : 'none';

    if (totalPages > 0) pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;

    const pageProperties = filteredProperties.slice((currentPage - 1) * PROPERTIES_PER_PAGE, currentPage * PROPERTIES_PER_PAGE);

    pageProperties.forEach(p => {
        const priceFormatted = p.price.toLocaleString('es-ES') + (p.operation === 'alquilar' ? ' €/mes' : ' €');
        const card = `
			<div class="bg-white rounded-lg shadow-md overflow-hidden text-left property-card">
				<a href="propiedad.html?id=${p.id}" class="block">
					<div class="relative">
						<img src="${p.images && p.images[0] ? p.images[0] : 'https://via.placeholder.com/400x300.png?text=Sin+Imagen'}" alt="${p.title}" class="w-full h-56 object-cover">
						${p.tag ? `<div class="absolute top-4 left-4 bg-[#587C9A] text-white text-sm font-bold px-3 py-1 rounded">${p.tag}</div>` : ''}
					</div>
					<div class="p-6">
						<p class="text-2xl font-bold text-[#2C3E50]">${priceFormatted}</p>
						<h3 class="text-xl font-bold mt-2 truncate">${p.title}</h3>
						<div class="flex items-center mt-4 text-gray-600 space-x-4">
							${p.beds > 0 ? `<span>🏯 ${p.beds} hab.</span>` : ''}
							${p.baths > 0 ? `<span>🛁 ${p.baths} baños</span>` : ''}
							<span>📏 ${p.sqm} m²</span>
						</div>
					</div>
				</a>
			</div>`;
        grid.innerHTML += card;
    });
}

document.querySelectorAll('#operation-filter button, #type-filter button').forEach(button => {
    button.addEventListener('click', (e) => {
        const parent = e.target.closest('div');
        parent.querySelector('.active').classList.remove('active');
        e.target.classList.add('active');
        filters[parent.id.split('-')[0]] = e.target.dataset.value;
        applyFiltersAndRender();
    });
});

['min-price', 'max-price'].forEach(id => {
    document.getElementById(id).addEventListener('input', (e) => {
        const filterKey = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
        filters[filterKey] = e.target.value ? parseFloat(e.target.value) : null;
        applyFiltersAndRender();
    });
});

document.getElementById('sort-by').addEventListener('change', (e) => {
    filters.sortBy = e.target.value;
    applyFiltersAndRender();
});

prevPageBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderPage(); } });
nextPageBtn.addEventListener('click', () => { const totalPages = Math.ceil(filteredProperties.length / PROPERTIES_PER_PAGE); if (currentPage < totalPages) { currentPage++; renderPage(); } });

// Lógica para Menú Móvil
const mobileMenuButton = document.getElementById('mobile-menu-button');
const closeMenuButton = document.getElementById('close-menu-button');
const mobileMenu = document.getElementById('mobile-menu');
if (mobileMenuButton) mobileMenuButton.addEventListener('click', () => { mobileMenu.classList.remove('hidden'); });
if (closeMenuButton) closeMenuButton.addEventListener('click', () => { mobileMenu.classList.add('hidden'); });

fetchAllProperties();

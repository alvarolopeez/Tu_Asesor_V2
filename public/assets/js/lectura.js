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

const mobileMenuButton = document.getElementById('mobile-menu-button');
const closeMenuButton = document.getElementById('close-menu-button');
const mobileMenu = document.getElementById('mobile-menu');
if (mobileMenuButton) mobileMenuButton.addEventListener('click', () => mobileMenu.classList.remove('hidden'));
if (closeMenuButton) closeMenuButton.addEventListener('click', () => mobileMenu.classList.add('hidden'));

const loadingDiv = document.getElementById('loading-state');
const contentDiv = document.getElementById('content-state');
const errorDiv = document.getElementById('error-state');

async function loadPost() {
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('id');
    if (!postId) {
        loadingDiv.style.display = 'none';
        errorDiv.classList.remove('hidden');
        return;
    }
    try {
        const docRef = doc(db, "posts", postId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const post = docSnap.data();
            document.title = `${post.title} | Tu Asesor Álvaro`;
            document.getElementById('post-title').textContent = post.title;
            if (post.createdAt) {
                const date = post.createdAt.toDate();
                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                document.getElementById('post-date').textContent = `Publicado el ${date.toLocaleDateString('es-ES', options)}`;
            }
            const postImage = document.getElementById('post-image');
            if (post.featuredImage) {
                postImage.src = post.featuredImage;
                postImage.alt = post.title;
            } else {
                postImage.style.display = 'none';
            }
            document.getElementById('post-content').innerHTML = post.contentHtml;
            loadingDiv.style.display = 'none';
            contentDiv.classList.remove('hidden');
        } else {
            loadingDiv.style.display = 'none';
            errorDiv.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Error al cargar el post:", error);
        loadingDiv.style.display = 'none';
        errorDiv.classList.remove('hidden');
    }
}

loadPost();

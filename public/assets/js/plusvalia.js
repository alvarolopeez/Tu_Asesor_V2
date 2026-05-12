import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyA78OwJGC3Wt3l8UOBvH4tqEom8W4o3qII",
    authDomain: "web-alvaro-inmo.firebaseapp.com",
    projectId: "web-alvaro-inmo",
    storageBucket: "web-alvaro-inmo.firebasestorage.app",
    messagingSenderId: "380224636452",
    appId: "1:380224636452:web:def2556143a2a0423ffab1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

onAuthStateChanged(auth, (user) => {
    if (!user) {
        const currentPage = window.location.pathname.split('/').pop();
        window.location.href = `acceso.html?redirect=${currentPage}`;
    }
});

// Menú móvil
const mobileMenuButton = document.getElementById('mobile-menu-button');
const closeMenuButton = document.getElementById('close-menu-button');
const mobileMenu = document.getElementById('mobile-menu');
if (mobileMenuButton) { mobileMenuButton.addEventListener('click', () => mobileMenu.classList.remove('hidden')); }
if (closeMenuButton) { closeMenuButton.addEventListener('click', () => mobileMenu.classList.add('hidden')); }

// Calculadora Plusvalía Municipal
const plusvaliaForm = document.getElementById('plusvalia-form');
const resultadoMunicipalContainer = document.getElementById('resultado-municipal-container');
if (plusvaliaForm) {
    plusvaliaForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const valorCatastral = parseFloat(document.getElementById('valor-catastral').value);
        const fechaCompra = new Date(document.getElementById('fecha-compra').value);
        const fechaVenta = new Date(document.getElementById('fecha-venta').value);
        if (isNaN(valorCatastral) || !fechaCompra.getTime() || !fechaVenta.getTime() || fechaVenta < fechaCompra) {
            alert('Por favor, introduce valores válidos en la calculadora municipal.'); return;
        }
        const diffTime = Math.abs(fechaVenta - fechaCompra);
        const years = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365.25));
        const coeficientes = { 0: 0.14, 1: 0.13, 2: 0.15, 3: 0.16, 4: 0.17, 5: 0.17, 6: 0.16, 7: 0.12, 8: 0.10, 9: 0.09, 10: 0.08, 11: 0.08, 12: 0.08, 13: 0.08, 14: 0.09, 15: 0.10, 16: 0.12, 17: 0.13, 18: 0.15, 19: 0.18, 20: 0.18 };
        const aniosCompletos = years >= 20 ? 20 : years;
        const coeficienteAplicable = coeficientes[aniosCompletos];
        const baseImponible = valorCatastral * coeficienteAplicable;
        const tipoImpositivoSevilla = 0.30;
        const cuotaFinal = baseImponible * tipoImpositivoSevilla;
        document.getElementById('base-imponible').textContent = baseImponible.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        document.getElementById('cuota-final').textContent = cuotaFinal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        resultadoMunicipalContainer.classList.remove('hidden');
    });
}

// Calculadora Plusvalía Fiscal
const gananciaForm = document.getElementById('ganancia-form');
const resultadoGananciaContainer = document.getElementById('resultado-ganancia-container');
const bonusMessageDiv = document.getElementById('bonus-message');
if (gananciaForm) {
    gananciaForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const valorVenta = parseFloat(document.getElementById('valor-transmision').value);
        const gastosVenta = parseFloat(document.getElementById('gastos-transmision').value);
        const valorCompra = parseFloat(document.getElementById('valor-adquisicion').value);
        const gastosCompra = parseFloat(document.getElementById('gastos-adquisicion').value);
        const fechaCompraFiscal = new Date(document.getElementById('fecha-adquisicion-fiscal').value);
        const fechaVentaFiscal = new Date(document.getElementById('fecha-transmision-fiscal').value);
        if (isNaN(valorVenta) || isNaN(gastosVenta) || isNaN(valorCompra) || isNaN(gastosCompra) || !fechaCompraFiscal.getTime() || !fechaVentaFiscal.getTime() || fechaVentaFiscal < fechaCompraFiscal) {
            alert('Por favor, introduce valores y fechas válidos.'); return;
        }
        const valorNetoVenta = valorVenta - gastosVenta;
        const valorNetoCompra = valorCompra + gastosCompra;
        const ganancia = valorNetoVenta - valorNetoCompra;
        let impuesto = 0;
        let gananciaTributable = ganancia;
        let reduccionAbatimiento = 0;
        const bonusDate = new Date('1994-12-31');
        if (fechaCompraFiscal <= bonusDate && ganancia > 0) {
            const limitDate2006 = new Date('2006-01-20');
            const yearsBefore1995 = Math.floor((bonusDate - fechaCompraFiscal) / (1000 * 60 * 60 * 24 * 365.25)) + 1;
            const reduccionPorcentaje = yearsBefore1995 * 0.1112;
            const finalReduccionPorcentaje = Math.min(reduccionPorcentaje, 1);
            const totalDaysOwned = (fechaVentaFiscal - fechaCompraFiscal) / (1000 * 60 * 60 * 24);
            const daysUntil2006 = (limitDate2006 - fechaCompraFiscal) / (1000 * 60 * 60 * 24);
            if (daysUntil2006 > 0) {
                const gananciaAntes2006 = ganancia * (daysUntil2006 / totalDaysOwned);
                reduccionAbatimiento = gananciaAntes2006 * finalReduccionPorcentaje;
                gananciaTributable = ganancia - reduccionAbatimiento;
            }
            document.getElementById('fila-reduccion').classList.remove('hidden');
            document.getElementById('fila-base-imponible').classList.remove('hidden');
            bonusMessageDiv.innerHTML = `<strong>Aviso sobre bonificación:</strong> Se ha aplicado una reducción por coeficientes de abatimiento. Esta reducción está limitada a un valor de transmisión acumulado de 400.000€.`;
            bonusMessageDiv.classList.remove('hidden');
        } else {
            document.getElementById('fila-reduccion').classList.add('hidden');
            document.getElementById('fila-base-imponible').classList.add('hidden');
            bonusMessageDiv.classList.add('hidden');
        }
        if (gananciaTributable > 0) {
            if (gananciaTributable <= 6000) {
                impuesto = gananciaTributable * 0.19;
            } else if (gananciaTributable <= 50000) {
                impuesto = (6000 * 0.19) + ((gananciaTributable - 6000) * 0.21);
            } else if (gananciaTributable <= 200000) {
                impuesto = (6000 * 0.19) + (44000 * 0.21) + ((gananciaTributable - 50000) * 0.23);
            } else if (gananciaTributable <= 300000) {
                impuesto = (6000 * 0.19) + (44000 * 0.21) + (150000 * 0.23) + ((gananciaTributable - 200000) * 0.27);
            } else {
                impuesto = (6000 * 0.19) + (44000 * 0.21) + (150000 * 0.23) + (100000 * 0.27) + ((gananciaTributable - 300000) * 0.28);
            }
        }
        const gananciaNeta = ganancia - impuesto;
        document.getElementById('ganancia-patrimonial').textContent = ganancia.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        document.getElementById('reduccion-abatimiento').textContent = `- ${reduccionAbatimiento.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`;
        document.getElementById('base-imponible-irpf').textContent = gananciaTributable.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        document.getElementById('impuesto-final').textContent = `- ${impuesto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`;
        document.getElementById('ganancia-neta').textContent = gananciaNeta.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        resultadoGananciaContainer.classList.remove('hidden');
    });
}

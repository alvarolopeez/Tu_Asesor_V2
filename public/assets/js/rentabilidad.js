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

// Lógica para Menú Móvil
const mobileMenuButton = document.getElementById('mobile-menu-button');
const closeMenuButton = document.getElementById('close-menu-button');
const mobileMenu = document.getElementById('mobile-menu');
if (mobileMenuButton) mobileMenuButton.addEventListener('click', () => { mobileMenu.classList.remove('hidden'); });
if (closeMenuButton) closeMenuButton.addEventListener('click', () => { mobileMenu.classList.add('hidden'); });

// --- Lógica para la Calculadora de Rentabilidad ---
document.addEventListener('DOMContentLoaded', () => {
    const itpData = {
        'Andalucía': 0.07, 'Aragón': 0.08, 'Asturias': 0.08, 'Baleares': 0.08, 'Canarias': 0.065,
        'Cantabria': 0.10, 'Castilla - La Mancha': 0.09, 'Castilla y León': 0.08, 'Cataluña': 0.10,
        'Ceuta': 0.06, 'Comunidad de Madrid': 0.06, 'Comunidad Valenciana': 0.10, 'Extremadura': 0.08,
        'Galicia': 0.10, 'La Rioja': 0.07, 'Melilla': 0.06, 'Murcia': 0.08, 'Navarra': 0.06, 'País Vasco': 0.04
    };
    const irpfTramos = [
        { limit: 12450, rate: 0.19 }, { limit: 20200, rate: 0.24 }, { limit: 35200, rate: 0.30 },
        { limit: 60000, rate: 0.37 }, { limit: Infinity, rate: 0.45 }
    ];

    const comunidadSelect = document.getElementById('comunidad-autonoma');
    for (const key in itpData) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key;
        if (key === 'Andalucía') option.selected = true;
        comunidadSelect.appendChild(option);
    }

    const allInputs = document.querySelectorAll('input, select');
    allInputs.forEach(input => input.addEventListener('input', updateCalculations));

    const plazoSlider = document.getElementById('plazo-hipoteca');
    const financiadoSlider = document.getElementById('porcentaje-financiado');
    plazoSlider.addEventListener('input', () => {
        document.getElementById('plazo-hipoteca-valor').textContent = plazoSlider.value + 'a';
    });
    financiadoSlider.addEventListener('input', () => {
        document.getElementById('porcentaje-financiado-valor').textContent = financiadoSlider.value + '%';
    });

    const hipotecaToggle = document.getElementById('toggle-hipoteca');
    hipotecaToggle.addEventListener('change', () => {
        document.getElementById('hipoteca-inputs').style.display = hipotecaToggle.checked ? 'grid' : 'none';
        updateCalculations();
    });

    // Chart.js está disponible globalmente por CDN
    // eslint-disable-next-line no-undef
    Chart.register(ChartDataLabels);
    let inversionChart, cashflowChart, hipotecaChart;

    function formatCurrency(value) {
        return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    const calculateIRPF = (base) => {
        let tax = 0;
        let remaining = base;
        for (let i = 0; i < irpfTramos.length; i++) {
            const prevLimit = i > 0 ? irpfTramos[i - 1].limit : 0;
            if (remaining > 0) {
                const taxableInBracket = Math.min(remaining, irpfTramos[i].limit - prevLimit);
                tax += taxableInBracket * irpfTramos[i].rate;
                remaining -= taxableInBracket;
            }
        }
        return tax;
    };

    function updateCalculations() {
        const precioCompra = parseFloat(document.getElementById('precio-compra').value) || 0;
        const comunidad = document.getElementById('comunidad-autonoma').value;
        const gastosNotaria = parseFloat(document.getElementById('gastos-notaria').value) || 0;
        const gastosRegistro = parseFloat(document.getElementById('gastos-registro').value) || 0;
        const gastosGestoria = parseFloat(document.getElementById('gastos-gestoria').value) || 0;
        const gastosTasacion = parseFloat(document.getElementById('gastos-tasacion').value) || 0;
        const costeReforma = parseFloat(document.getElementById('coste-reforma').value) || 0;

        const conHipoteca = document.getElementById('toggle-hipoteca').checked;
        const porcentajeFinanciado = parseFloat(document.getElementById('porcentaje-financiado').value) / 100 || 0;
        const tipoInteres = parseFloat(document.getElementById('tipo-interes').value) / 100 || 0;
        const plazoAnios = parseInt(document.getElementById('plazo-hipoteca').value) || 0;

        const alquilerMensual = parseFloat(document.getElementById('alquiler-mensual').value) || 0;
        const gastosComunidad = parseFloat(document.getElementById('gastos-comunidad').value) || 0;
        const gastosIbi = parseFloat(document.getElementById('gastos-ibi').value) || 0;
        const gastosSeguroHogar = parseFloat(document.getElementById('gastos-seguro-hogar').value) || 0;
        const gastosMantenimiento = parseFloat(document.getElementById('gastos-mantenimiento').value) || 0;
        const gastosSeguroImpago = parseFloat(document.getElementById('gastos-seguro-impago').value) || 0;
        const salarioBruto = parseFloat(document.getElementById('tramo-irpf-general').value) || 0;

        const itp = precioCompra * itpData[comunidad];
        const gastosCompraTotal = itp + gastosNotaria + gastosRegistro + gastosGestoria + (conHipoteca ? gastosTasacion : 0);
        const inversionTotal = precioCompra + gastosCompraTotal + costeReforma;

        let pagoAnualHipoteca = 0;
        let aportacionPropia = inversionTotal;

        if (conHipoteca && tipoInteres > 0 && plazoAnios > 0) {
            const capitalPrestamo = precioCompra * porcentajeFinanciado;
            aportacionPropia = inversionTotal - capitalPrestamo;
            const tipoInteresMensual = tipoInteres / 12;
            const numeroCuotas = plazoAnios * 12;
            const cuotaMensualHipoteca = capitalPrestamo * (tipoInteresMensual * Math.pow(1 + tipoInteresMensual, numeroCuotas)) / (Math.pow(1 + tipoInteresMensual, numeroCuotas) - 1);
            pagoAnualHipoteca = cuotaMensualHipoteca * 12;
        }

        const ingresosAnuales = alquilerMensual * 12;
        const gastosFijosAnuales = gastosComunidad + gastosIbi + gastosSeguroHogar + gastosMantenimiento + gastosSeguroImpago;
        const beneficioBrutoAntesHipoteca = ingresosAnuales - gastosFijosAnuales;

        let irpf = 0;
        let tipoEfectivoIRPF = 0;
        let baseImponibleIRPF = 0;
        if (beneficioBrutoAntesHipoteca > 0) {
            baseImponibleIRPF = beneficioBrutoAntesHipoteca * 0.4;
            const irpfConAlquiler = calculateIRPF(salarioBruto + baseImponibleIRPF);
            const irpfSinAlquiler = calculateIRPF(salarioBruto);
            irpf = irpfConAlquiler - irpfSinAlquiler;
            if (baseImponibleIRPF > 0) tipoEfectivoIRPF = (irpf / baseImponibleIRPF) * 100;
        }

        const gastosAnualesTotales = gastosFijosAnuales + pagoAnualHipoteca;
        const beneficioNetoAnual = ingresosAnuales - gastosAnualesTotales - irpf;
        const cashflowMensual = beneficioNetoAnual / 12;
        const rentabilidadNeta = (inversionTotal > 0) ? (beneficioNetoAnual / inversionTotal) * 100 : 0;
        const roi = (aportacionPropia > 0) ? (beneficioNetoAnual / aportacionPropia) * 100 : 0;

        document.getElementById('rentabilidad-neta-kpi').textContent = `${rentabilidadNeta.toFixed(2)}%`;
        document.getElementById('roi-kpi').textContent = `${roi.toFixed(2)}%`;
        document.getElementById('cashflow-kpi').textContent = formatCurrency(cashflowMensual);
        document.getElementById('inversion-kpi').textContent = formatCurrency(aportacionPropia);

        document.getElementById('out-ingresos').textContent = formatCurrency(ingresosAnuales);
        document.getElementById('out-gastos-anuales').textContent = `- ${formatCurrency(gastosAnualesTotales)}`;
        document.getElementById('out-beneficio-bruto').textContent = formatCurrency(ingresosAnuales - gastosAnualesTotales);
        document.getElementById('out-base-irpf').textContent = formatCurrency(baseImponibleIRPF);
        document.getElementById('out-tipo-irpf').textContent = `${tipoEfectivoIRPF.toFixed(2)}%`;
        document.getElementById('out-irpf').textContent = `- ${formatCurrency(irpf)}`;
        document.getElementById('out-beneficio-neto').textContent = formatCurrency(beneficioNetoAnual);

        updateInversionChart(aportacionPropia - gastosCompraTotal - costeReforma, itp, gastosNotaria + gastosRegistro + gastosGestoria + (conHipoteca ? gastosTasacion : 0), costeReforma);
        updateCashflowChart(ingresosAnuales, gastosAnualesTotales);
        updateHipotecaChart(conHipoteca ? precioCompra * porcentajeFinanciado : 0, tipoInteres, plazoAnios);
    }

    function updateInversionChart(capital, itp, otrosGastos, reforma) {
        const data = {
            labels: ['Aportación Capital', 'ITP', 'Otros Gastos Compra', 'Reforma'],
            datasets: [{
                data: [capital, itp, otrosGastos, reforma],
                backgroundColor: ['#2C3E50', '#587C9A', '#8BA7C1', '#b0c4de'],
                borderColor: 'rgba(255, 255, 255, 0.2)',
            }]
        };
        if (!inversionChart) {
            // eslint-disable-next-line no-undef
            inversionChart = new Chart(document.getElementById('inversionChart'), {
                type: 'doughnut',
                data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: 'white', boxWidth: 15 } },
                        title: { display: true, text: 'Desglose Aportación Inicial', color: 'white', font: { size: 16 } },
                        // eslint-disable-next-line no-undef
                        datalabels: { color: 'white', font: { weight: 'bold' }, formatter: (value) => value > 0 ? formatCurrency(value) : '' }
                    }
                }
            });
        } else {
            inversionChart.data = data;
            inversionChart.update();
        }
    }

    function updateCashflowChart(ingresos, gastos) {
        const data = {
            labels: [''],
            datasets: [
                { label: 'Ingresos Totales', data: [ingresos], backgroundColor: '#2ecc71' },
                { label: 'Gastos Totales', data: [gastos], backgroundColor: '#e74c3c' }
            ]
        };
        if (!cashflowChart) {
            // eslint-disable-next-line no-undef
            cashflowChart = new Chart(document.getElementById('cashflowChart'), {
                type: 'bar',
                data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { x: { ticks: { color: 'white' } }, y: { ticks: { color: 'white', beginAtZero: true } } },
                    plugins: {
                        legend: { position: 'bottom', labels: { color: 'white', boxWidth: 15 } },
                        title: { display: true, text: 'Flujo de Caja Anual', color: 'white', font: { size: 16 } },
                        // eslint-disable-next-line no-undef
                        datalabels: { color: 'white', font: { weight: 'bold', size: 14 }, anchor: 'end', align: 'end', formatter: (value) => value !== 0 ? formatCurrency(value) : '' }
                    }
                }
            });
        } else {
            cashflowChart.data = data;
            cashflowChart.update();
        }
    }

    function updateHipotecaChart(capital, interes, anios) {
        const dataPoints = [];
        let capitalPendiente = capital;
        const interesMensual = interes / 12;
        const numCuotas = anios * 12;
        if (capital > 0 && interes > 0 && anios > 0) {
            const cuota = capital * (interesMensual * Math.pow(1 + interesMensual, numCuotas)) / (Math.pow(1 + interesMensual, numCuotas) - 1);
            for (let i = 0; i <= anios; i++) {
                if (i > 0) {
                    for (let j = 1; j <= 12; j++) {
                        const interesPagado = capitalPendiente * interesMensual;
                        const capitalAmortizado = cuota - interesPagado;
                        capitalPendiente -= capitalAmortizado;
                    }
                }
                dataPoints.push(capitalPendiente > 0 ? capitalPendiente : 0);
            }
        }
        const data = {
            labels: Array.from({ length: anios + 1 }, (_, i) => `${i}`),
            datasets: [{
                label: 'Capital Pendiente',
                data: dataPoints,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                fill: true,
                tension: 0.4
            }]
        };
        if (!hipotecaChart) {
            // eslint-disable-next-line no-undef
            hipotecaChart = new Chart(document.getElementById('hipotecaChart'), {
                type: 'line',
                data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { title: { display: true, text: 'Años', color: 'white' }, ticks: { color: 'white' } },
                        y: { title: { display: true, text: 'Capital (€)', color: 'white' }, ticks: { color: 'white' } }
                    },
                    plugins: {
                        legend: { display: false },
                        title: { display: true, text: 'Proyección Amortización Hipoteca', color: 'white', font: { size: 16 } },
                        // eslint-disable-next-line no-undef
                        datalabels: { display: false }
                    }
                }
            });
        } else {
            hipotecaChart.data = data;
            hipotecaChart.options.scales.x.labels = data.labels;
            hipotecaChart.update();
        }
    }

    updateCalculations();
});

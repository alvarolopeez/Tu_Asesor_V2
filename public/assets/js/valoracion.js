import { initializeApp } from "https://www.gstatic.com/firebasejs/9.16.0/firebase-app.js";
import { getAuth, signInWithPhoneNumber, RecaptchaVerifier } from "https://www.gstatic.com/firebasejs/9.16.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.16.0/firebase-firestore.js";

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
auth.languageCode = 'es';
const db = getFirestore(app);

let formData = {
    type: '',
    address: '',
    zip: '',
    city: 'Sevilla',
    floorLevel: 0,
    sqm: 0,
    rooms: 2,
    baths: 1,
    elevator: false,
    terrace: false,
    garage: false,
    condition: 'bueno',
    contact: {},
    privacyAccepted: false,
    marketingAccepted: false,
    lat: null,
    lon: null
};

window.confirmationResult = null;

// --- INICIO ---
document.addEventListener('DOMContentLoaded', () => {
    setupRecaptcha();
    setupAutocomplete();
});

// --- AUTOCOMPLETADO (Nominatim) ---
function setupAutocomplete() {
    // AHORA APUNTAMOS A 'val-street'
    const input = document.getElementById('val-street');
    const suggestionsBox = document.getElementById('address-suggestions');
    let timeoutId;

    input.addEventListener('input', (e) => {
        const query = e.target.value;
        clearTimeout(timeoutId);
        
        if (query.length < 3) {
            suggestionsBox.style.display = 'none';
            return;
        }

        timeoutId = setTimeout(async () => {
            try {
                // Buscamos priorizando Sevilla
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query + ' Sevilla')}&countrycodes=es&limit=5`);
                const results = await response.json();
                renderSuggestions(results);
            } catch (error) {
                console.error("Error buscando dirección:", error);
            }
        }, 400);
    });

    // Cerrar si clic fuera
    document.addEventListener('click', (e) => {
        if (e.target !== input && e.target !== suggestionsBox) {
            suggestionsBox.style.display = 'none';
        }
    });
}

    function renderSuggestions(results) {
        const suggestionsBox = document.getElementById('address-suggestions'); // Referencia local necesaria
        suggestionsBox.innerHTML = '';
        if (results.length === 0) {
            suggestionsBox.style.display = 'none';
            return;
        }

        results.forEach(place => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            
            // DATOS LIMPIOS
            const road = place.address.road || place.display_name.split(',')[0];
            const city = place.address.city || place.address.town || place.address.village || 'Sevilla'; 
            // Detectar si viene número en la API
            const houseNumber = place.address.house_number || '';

            // Mostrar sugerencia (Solo mostramos calle y ciudad para no liar)
            div.innerHTML = `<strong>${road} ${houseNumber ? ', ' + houseNumber : ''}</strong><br><span class="text-xs text-gray-500">${city}</span>`;
            
            div.addEventListener('click', () => {
                // 1. Rellenar Calle
                document.getElementById('val-street').value = road;
                
                // 2. Rellenar Número (si existe, si no, foco para que el usuario lo escriba)
                const numberInput = document.getElementById('val-number');
                if (houseNumber) {
                    numberInput.value = houseNumber;
                } else {
                    numberInput.value = '';
                    numberInput.focus(); // Foco automático para que escriba el número
                }

                // 3. Rellenar CP y Ciudad
                if (place.address.postcode) document.getElementById('val-zip').value = place.address.postcode;
                document.getElementById('val-city').value = city;
                
                suggestionsBox.style.display = 'none';
                
                // Guardar coordenadas
                formData.lat = parseFloat(place.lat);
                formData.lon = parseFloat(place.lon);
            });
            suggestionsBox.appendChild(div);
        });
        suggestionsBox.style.display = 'block';
    }

    document.addEventListener('click', (e) => {
        if (e.target !== input && e.target !== suggestionsBox) {
            suggestionsBox.style.display = 'none';
        }
    });


// --- NAVEGACIÓN ---
window.selectOption = (field, value, nextStepNum) => {
    formData[field] = value;
    const cards = document.querySelectorAll('.selectable-card');
    cards.forEach(c => c.classList.remove('bg-white/20', 'border-white'));
    event.currentTarget.classList.add('bg-white/20', 'border', 'border-white');
    setTimeout(() => showStep(nextStepNum), 300);
};

window.adjustValue = (id, amount) => {
    const input = document.getElementById(id);
    let val = parseInt(input.value) + amount;
    if(val < 0) val = 0;
    input.value = val;
};

window.prevStep = (step) => showStep(step);
window.nextStep = (step) => showStep(step);

window.validateStep2 = () => {
    const street = document.getElementById('val-street').value;
    const number = document.getElementById('val-number').value;
    const zip = document.getElementById('val-zip').value;
    const city = document.getElementById('val-city').value;
    const floor = document.getElementById('val-floor').value;
    const errorEl = document.getElementById('error-step-2');
    
    // Validación: Calle, Número y CP son obligatorios
    if(!street || !number || zip.length < 5) {
        errorEl.textContent = "Por favor, indica la calle, el número y el código postal.";
        errorEl.classList.remove('hidden');
        return;
    }
    
    errorEl.classList.add('hidden');
    
    // Guardamos la dirección completa unida
    formData.address = `${street}, ${number}`;
    formData.zip = zip;
    formData.city = city;
    formData.floorLevel = floor ? parseInt(floor) : 0; 
    
    showStep(3);
};

window.validateStep3 = () => {
    const sqm = document.getElementById('val-sqm').value;
    const errorEl = document.getElementById('error-step-3');
    if(!sqm || sqm < 20) {
        errorEl.textContent = "Introduce una superficie válida (mínimo 20m²).";
        errorEl.classList.remove('hidden');
        return;
    }
    errorEl.classList.add('hidden');
    formData.sqm = parseInt(sqm);
    formData.rooms = parseInt(document.getElementById('val-rooms').value);
    formData.baths = parseInt(document.getElementById('val-baths').value);
    showStep(4);
};

function showStep(step) {
    if(step === 5) {
        formData.elevator = document.getElementById('feat-elevator').checked;
        formData.terrace = document.getElementById('feat-terrace').checked;
        formData.garage = document.getElementById('feat-garage').checked;
        formData.condition = document.getElementById('val-condition').value;
    }
    document.querySelectorAll('.step-content').forEach(el => el.classList.add('hidden'));
    document.querySelector(`.step-content[data-step="${step}"]`).classList.remove('hidden');
    const progress = (step / 6) * 100;
    document.getElementById('progress-bar').style.width = `${progress}%`;
}

// --- SMS ---
function setupRecaptcha() {
    if(!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier('recaptcha-container', {
            'size': 'invisible',
            'callback': () => {}
        }, auth);
    }
}

function showFeedback(message, type = 'error') {
    const el = document.getElementById('sms-feedback');
    el.textContent = message;
    el.className = type === 'error' 
        ? 'p-2 rounded text-center text-sm font-bold bg-red-500/20 text-red-200 border border-red-500' 
        : 'p-2 rounded text-center text-sm font-bold bg-green-500/20 text-green-200 border border-green-500';
    el.classList.remove('hidden');
}

const sendSmsBtn = document.getElementById('send-sms-btn');
if(sendSmsBtn) {
    sendSmsBtn.addEventListener('click', () => {
        const phoneInput = document.getElementById('contact-phone').value;
        const name = document.getElementById('contact-name').value;
        const email = document.getElementById('contact-email').value;
        const surname = document.getElementById('contact-surname').value;
        const privacy = document.getElementById('privacy-check').checked;
        const marketing = document.getElementById('marketing-check').checked;

        if(!name || !email || !phoneInput) {
            showFeedback("Rellena todos los campos personales.");
            return;
        }
        if(!privacy) {
            showFeedback("Debes aceptar la Política de Privacidad.");
            return;
        }

        const phoneNumber = "+34" + phoneInput.replace(/\s/g, '');
        const appVerifier = window.recaptchaVerifier;
        
        sendSmsBtn.disabled = true;
        sendSmsBtn.textContent = "Enviando...";

        signInWithPhoneNumber(auth, phoneNumber, appVerifier)
            .then((confirmationResult) => {
                window.confirmationResult = confirmationResult;
                document.getElementById('sms-feedback').classList.add('hidden');
                sendSmsBtn.classList.add('hidden');
                document.getElementById('verification-area').classList.remove('hidden');
                
                formData.contact = { name, surname, email, phone: phoneNumber };
                formData.privacyAccepted = true;
                formData.marketingAccepted = marketing;
                showFeedback("Código SMS enviado", "success");
            }).catch((error) => {
                console.error(error);
                sendSmsBtn.disabled = false;
                sendSmsBtn.textContent = "Enviar Código de Verificación";
                showFeedback("Error al enviar. Verifica el número.");
            });
    });
}

document.getElementById('retry-sms-btn')?.addEventListener('click', () => {
    document.getElementById('verification-area').classList.add('hidden');
    sendSmsBtn.classList.remove('hidden');
    sendSmsBtn.disabled = false;
    sendSmsBtn.textContent = "Reenviar Código";
});

const verifyCodeBtn = document.getElementById('verify-code-btn');
// ... (código anterior a esta función, incluyendo la definición de const verifyCodeBtn)

if(verifyCodeBtn) {
    verifyCodeBtn.addEventListener('click', () => {
        const code = document.getElementById('sms-code').value;
        if(!code) return;

        verifyCodeBtn.textContent = "Verificando...";

        window.confirmationResult.confirm(code).then((result) => {
            // Éxito en la verificación
            finishProcess(true);
        }).catch((error) => {
            // Error en la verificación
            showFeedback("Código incorrecto.");
            verifyCodeBtn.textContent = "Ver Resultado";
        });
    });
}

// --- CÁLCULO FINAL (Lógica Max = Valor, Min = Valor - 20%) ---

// Función simple para comprobar si punto está en polígono (Ray Casting)
function isPointInPolygon(point, vs) {
    var x = point.lng, y = point.lat;
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i].lng, yi = vs[i].lat;
        var xj = vs[j].lng, yj = vs[j].lat;
        var intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Lógica de Email (Placeholder)
async function triggerEmailWorkflow(data) {
    console.log("📩 [EMAIL] Nuevo Lead:", data);
    // Aquí conectarás tu backend de email en el futuro
    return true; 
}

// Función principal que calcula y guarda los datos
async function finishProcess(isVerified) {
    if(!isVerified) return;

    let matchedZone = null;
    let coords = { lat: formData.lat, lng: formData.lon };
    
    // Geocodificación fallback
    if (!coords.lat) {
        try {
             const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(formData.address + ', ' + formData.zip)}&limit=1`);
             const data = await res.json();
             if(data.length > 0) coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        } catch(e) { console.error(e); }
    }

    if (coords.lat) {
        const querySnapshot = await getDocs(collection(db, "zonas_valoracion"));
        querySnapshot.forEach((doc) => {
            const zone = doc.data();
            if (zone.coordinates && isPointInPolygon(coords, zone.coordinates)) {
                matchedZone = zone;
            }
        });
    }

    let estimatedPriceMin = 0;
    let estimatedPriceMax = 0;
    const isMacarena = !!matchedZone;

    if (isMacarena) {
        let basePrice = matchedZone.basePrice;
        let multiplier = 1.0;
        const mods = matchedZone.modifiers;

        // Modificadores de estado y extras
        if(formData.condition === 'reformar') multiplier += (mods.reformar / 100);
        if(formData.condition === 'reformado') multiplier += (mods.reformado / 100);
        
        if(formData.elevator) {
            multiplier += (mods.elevator / 100);
        } else {
            if(formData.floorLevel > 1) {
                const penaltyPerFloor = mods.noLiftPenalty || 0; 
                const steps = formData.floorLevel - 1; 
                const totalPenalty = steps * penaltyPerFloor;
                multiplier -= (totalPenalty / 100);
            }
        }

        if(formData.terrace) multiplier += 0.05;
        if(formData.garage) multiplier += (mods.garage / 100);
        if(formData.type === 'casa') multiplier += 0.20;

        const totalValue = formData.sqm * basePrice * multiplier;
        
        // Lógica de Precios: Máximo = Valor, Mínimo = Valor - 20%
        estimatedPriceMax = Math.round(totalValue / 1000) * 1000;
        const minValue = totalValue * 0.80; 
        estimatedPriceMin = Math.round(minValue / 1000) * 1000;
    }

    try {
        const valuationData = {
            ...formData,
            precioEstimado: isMacarena ? { min: estimatedPriceMin, max: estimatedPriceMax } : "Manual",
            zonaDetectada: matchedZone ? matchedZone.name : "Fuera de zona",
            fecha: serverTimestamp(),
            verificado: true
        };
        
        await addDoc(collection(db, "valoraciones"), valuationData);
        await triggerEmailWorkflow(valuationData);

    } catch (e) { console.error(e); }

    showStep(6);
    if(isMacarena) {
        document.getElementById('result-macarena').classList.remove('hidden');
        document.getElementById('price-range-display').innerText = `${estimatedPriceMin.toLocaleString('es-ES')} € - ${estimatedPriceMax.toLocaleString('es-ES')} €`;
        document.getElementById('res-email').innerText = formData.contact.email;
    } else {
        document.getElementById('result-manual').classList.remove('hidden');
    }
}
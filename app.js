const API_KEY = "AQ.Ab8RN6IU8sDHdLHNX0zLLZHo2mq6Hox9uDcR4Oh0Lzxhrw438A";

const chatWindow = document.getElementById('chat-window');
const auditWindow = document.getElementById('audit-window');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

let excludedIds = [];

function addChatMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    if (sender === 'user') {
        messageDiv.style.backgroundColor = '#ff69b4';
        messageDiv.style.color = 'white';
        messageDiv.style.alignSelf = 'flex-end';
        messageDiv.style.borderBottomRightRadius = '2px';
    } else {
        messageDiv.classList.add('ai-message');
    }
    messageDiv.textContent = text;
    chatWindow.appendChild(messageDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addAuditLog(actionText) {
    const logDiv = document.createElement('div');
    logDiv.classList.add('log-entry');
    logDiv.textContent = `[System ${new Date().toLocaleTimeString()}]: ${actionText}`;
    auditWindow.appendChild(logDiv);
    auditWindow.scrollTop = auditWindow.scrollHeight;
}

function createProductCard(product) {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('product-card');

    cardDiv.innerHTML = `
        <img src="${product.image}" alt="${product.name}" class="product-image">
        <div class="product-info">
            <h4>${product.name}</h4>
            <p>₹${product.price}</p>
        </div>
        <div class="card-actions">
            <button class="btn-buy" id="buy-${product.id}">Pay Now</button>
            <button class="btn-skip" id="skip-${product.id}">Not this one</button>
        </div>
    `;

    chatWindow.appendChild(cardDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    document.getElementById(`buy-${product.id}`).addEventListener('click', () => {
        addAuditLog(`PAYMENT TRIGGER: Opening Razorpay Checkout for ${product.name} (₹${product.price})...`);

        var options = {
            "key": "rzp_test_HdbQ0mLDRL9PZW", 
            "amount": product.price * 100, 
            "currency": "INR",
            "name": "Aura Beauty AI",
            "description": `Secure purchase of ${product.name}`,
            "image": product.image,
            "handler": function (response){
                addAuditLog(`SUCCESS: Payment completed! Payment ID: ${response.razorpay_payment_id}`);
                addChatMessage(`🎉 Payment successful! Your order for ${product.name} is confirmed. Payment ID: ${response.razorpay_payment_id}`, 'ai');
            },
            "prefill": {
                "name": "Rajanya Maity",
                "email": "rajanya@example.com",
                "contact": "9999999999"
            },
            "theme": {
                "color": "#ff69b4"
            },
            "modal": {
                "ondismiss": function() {
                    addAuditLog(`MODAL CLOSED: User closed the Razorpay payment window.`);
                }
            }
        };

        try {
            var rzp = new Razorpay(options);
            rzp.open();
        } catch (error) {
            addAuditLog(`PAYMENT ERROR: ${error.message}`);
            alert("Could not open payment gateway. Make sure you are running via Live Server!");
        }
    });

    document.getElementById(`skip-${product.id}`).addEventListener('click', () => {
        excludedIds.push(product.id);
        addAuditLog(`User rejected ID ${product.id}.`);
        addChatMessage("No worries! Tell me what else you'd like to check out.", 'ai');
        cardDiv.querySelector('.card-actions').style.display = 'none'; 
    });
}

async function processWithAura(userText) {
    addAuditLog("Fetching catalog.json...");
    
    try {
        const catalogResponse = await fetch('catalog.json');
        const catalogData = await catalogResponse.json();
        
        const categories = ["lipstick", "primer", "setting spray", "foundation", "eyeliner", "mascara", "kajal", "blush", "concealer", "contour"];
        let detectedCategory = null;

        try {
            addAuditLog("Sending query to Gemini AI...");
            const prompt = `Extract the core product category from: "${userText}" using only: ${JSON.stringify(categories)}. Reply with ONLY the category name or NULL.`;

            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${API_KEY}`;
            const aiResponse = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            const data = await aiResponse.json();
            if (data.error) throw new Error(data.error.message);

            detectedCategory = data.candidates[0].content.parts[0].text.trim().toLowerCase();
            addAuditLog(`AI detected category: ${detectedCategory}`);
        } catch (aiErr) {
            // FALLBACK LOGIC IF QUOTA EXCEEDED OR API FAILS
            addAuditLog(`API QUOTA/ERROR FALLBACK: Switching to smart keyword matcher. (${aiErr.message})`);
            const lowerText = userText.toLowerCase();
            detectedCategory = categories.find(cat => lowerText.includes(cat)) || null;
            addAuditLog(`Fallback detected category: ${detectedCategory}`);
        }

        const foundProduct = catalogData.find(item => 
            item.category === detectedCategory && !excludedIds.includes(item.id)
        );

        if (foundProduct) {
            if (foundProduct.stock > 0) {
                addAuditLog(`Stock verified for ID ${foundProduct.id}. Rendering UI.`);
                addChatMessage(`I found this match for you!`, 'ai');
                createProductCard(foundProduct);
            } else {
                addAuditLog(`WARNING: ID ${foundProduct.id} out of stock.`);
                addChatMessage(`Oh no! The ${foundProduct.name} matches your request, but it's currently out of stock.`, 'ai');
            }
        } else {
            addAuditLog("Action bounded: No valid catalog match found.");
            addChatMessage("I couldn't find an available product matching that category. Try asking for lipstick, foundation, eyeliner, mascara, kajal, blush, concealer, contour, primer, or setting spray!", 'ai');
        }

    } catch (error) {
        addAuditLog(`CRITICAL ERROR: ${error.message}`);
        addChatMessage("Oops, something went wrong. Please try again!", 'ai');
    }
}

sendBtn.addEventListener('click', () => {
    const text = userInput.value.trim();
    if (text === '') return;
    addChatMessage(text, 'user');
    addAuditLog(`User input: "${text}"`);
    processWithAura(text);
    userInput.value = '';
});

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendBtn.click();
});
document.addEventListener('DOMContentLoaded', async () => {
    const loadingScreen = document.getElementById('loading-screen');
    const chatInterface = document.getElementById('chat-interface');
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');

    let engine = null;
    let conversation = [
        { role: "system", content: "You are XTEND-AI, an AI assistant designed to support students in extending their learning capabilities. Never answer questions directly or provide solutions. Instead, offer hints, ask helpful questions, provide relevant examples (e.g., in science), or work through parallel problems (e.g., in mathematics) to guide the student towards understanding. For all math equations, first generate a parallel equation on the same topic and area but with different variables, then work through it together with the student step by step. Format your responses using Markdown syntax: use '#' for headings, '*' or '-' for unordered list items, '1.' for ordered list items, '**' for bold text, '*' for italic text, and '>' for blockquotes or notes. Maintain context and memory of the conversation to provide personalized assistance. Never solve the given equation by the user." }
    ];

    // Function to update status message on the loading screen
    function updateStatus(message, type = "info") {
        const statusElement = loadingScreen.querySelector('p');
        statusElement.textContent = message;
        console.log(`Status [${type}]: ${message}`);
    }

    // Function to initialize WebLLM and load the model
    async function initWebLLM() {
        updateStatus("Initializing AI model... This may take a while.", "info");
        sendButton.disabled = true; // Disable send button while model loads

        try {
            // Initialize the WebLLM engine with a specified model
            engine = await window.webllm.CreateMLCEngine("Phi-3-mini-4k-instruct-q4f16_1-MLC", {
                initProgressCallback: (report) => {
                    updateStatus(`Loading model: ${report.text} (${(report.progress * 100).toFixed(0)}%)`, "info");
                }
            });
            updateStatus("AI model loaded successfully! Ready to chat.", "success");
            sendButton.disabled = false; // Enable send button once model is ready
            
            // Hide loading screen and show chat interface once model is loaded
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
                chatInterface.classList.remove('hidden');
                chatInterface.style.opacity = '1';
            }, 1000);
        } catch (error) {
            console.error("Error initializing WebLLM engine:", error);
            updateStatus(`Failed to load AI model: ${error.message}. Please refresh and try again.`, "error");
            sendButton.disabled = false;
        }
    }

    // Function to add a message to the chat
    function addMessageToChat(text, isUser = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // Process text as Markdown
        const formattedText = formatMarkdown(text);
        const messageText = document.createElement('div');
        messageText.innerHTML = formattedText;
        messageContent.appendChild(messageText);
        messageDiv.appendChild(messageContent);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Function to format text as Markdown
    function formatMarkdown(text) {
        // Split text into lines
        const lines = text.split('\n');
        let result = '';
        let inUnorderedList = false;
        let inOrderedList = false;
        let listItems = [];
        let inCodeBlock = false;
        let codeContent = [];

        lines.forEach(line => {
            // Handle code blocks
            if (line.match(/^\s*```/)) {
                if (inCodeBlock) {
                    result += `<pre><code>${codeContent.join('\n')}</code></pre>`;
                    inCodeBlock = false;
                    codeContent = [];
                } else {
                    inCodeBlock = true;
                }
                return;
            }
            if (inCodeBlock) {
                codeContent.push(line);
                return;
            }

            // Handle headings
            if (line.match(/^\s*#{1,6}\s/)) {
                const match = line.match(/^(#{1,6})\s+(.*)$/);
                const level = match[1].length;
                const content = match[2];
                result += `<h${level}>${formatInlineMarkdown(content)}</h${level}>`;
                return;
            }

            // Handle blockquotes/notes
            if (line.match(/^\s*>\s/)) {
                const content = line.replace(/^\s*>\s/, '');
                result += `<blockquote class="note">${formatInlineMarkdown(content)}</blockquote>`;
                return;
            }

            // Handle unordered lists
            const unorderedMatch = line.match(/^\s*[\*\-]\s+(.*)$/);
            if (unorderedMatch) {
                if (!inUnorderedList) {
                    inUnorderedList = true;
                    listItems = [];
                }
                listItems.push(`<li>${formatInlineMarkdown(unorderedMatch[1])}</li>`);
                return;
            } else if (inUnorderedList) {
                result += `<ul>${listItems.join('')}</ul>`;
                inUnorderedList = false;
                listItems = [];
            }

            // Handle ordered lists
            const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
            if (orderedMatch) {
                if (!inOrderedList) {
                    inOrderedList = true;
                    listItems = [];
                }
                listItems.push(`<li>${formatInlineMarkdown(orderedMatch[1])}</li>`);
                return;
            } else if (inOrderedList) {
                result += `<ol>${listItems.join('')}</ol>`;
                inOrderedList = false;
                listItems = [];
            }

            // Default to paragraph
            result += `<p>${formatInlineMarkdown(line)}</p>`;
        });

        // Close any remaining lists or code blocks
        if (inUnorderedList) {
            result += `<ul>${listItems.join('')}</ul>`;
        }
        if (inOrderedList) {
            result += `<ol>${listItems.join('')}</ol>`;
        }
        if (inCodeBlock) {
            result += `<pre><code>${codeContent.join('\n')}</code></pre>`;
        }

        return result || '<p></p>';
    }
    
    // Function to format inline Markdown elements
    function formatInlineMarkdown(text) {
        // Bold
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Italic
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Inline code
        text = text.replace(/`(.*?)`/g, '<code>$1</code>');
        return text;
    }

    // Function to handle sending a message
    async function sendMessage() {
        const text = userInput.value.trim();
        if (!text) return;

        // Add user message to chat
        addMessageToChat(text, true);
        userInput.value = '';

        if (engine) {
            try {
                // Disable input while processing
                userInput.disabled = true;
                sendButton.disabled = true;

                // Add user message to conversation
                conversation.push({ role: "user", content: text });

                // Limit conversation history to the last 10 messages (including system message) to improve performance
                if (conversation.length > 10) {
                    conversation = [conversation[0], ...conversation.slice(-(9))];
                }

                // Generate response using WebLLM with streaming
                const chunks = await engine.chat.completions.create({
                    messages: conversation,
                    temperature: 0.7,
                    stream: true
                });

                let reply = "";
                let responseDiv = null;
                
                for await (const chunk of chunks) {
                    const content = chunk.choices[0]?.delta.content || "";
                    reply += content;
                    
                    if (!responseDiv) {
                        responseDiv = document.createElement('div');
                        responseDiv.className = 'message bot';
                        const messageContent = document.createElement('div');
                        messageContent.className = 'message-content';
                        const messageText = document.createElement('div');
                        messageText.innerHTML = formatMarkdown(reply);
                        messageContent.appendChild(messageText);
                        responseDiv.appendChild(messageContent);
                        chatMessages.appendChild(responseDiv);
                    } else {
                        responseDiv.querySelector('div').innerHTML = formatMarkdown(reply);
                    }
                    
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }

                // Add final response to conversation
                conversation.push({ role: "assistant", content: reply });
            } catch (error) {
                console.error('Error generating response:', error);
                addMessageToChat('Sorry, there was an error processing your request. Please try again.');
            } finally {
                userInput.disabled = false;
                sendButton.disabled = false;
                userInput.focus();
            }
        } else {
            addMessageToChat('AI model is not loaded yet. Please wait...');
        }
    }

    // Event listeners
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Initialize WebLLM
    await initWebLLM();
});

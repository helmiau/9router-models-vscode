// Localhost Detection and CORS Handling for 9Router VSCode Modelator
// This script provides comprehensive localhost detection, file downloading, and CORS handling
// specifically designed for GitHub Pages → localhost scenarios

class LocalhostDetector {
    constructor() {
        this.isGitHubPages = this.detectGitHubPages();
        this.isLocalhost = false;
        this.localhostUrls = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
        this.corsSolutions = {
            fileProtocol: 'file://',
            localServer: 'python -m http.server 8080',
            proxy: 'https://cors-anywhere.herokuapp.com/',
            custom: 'Custom CORS proxy'
        };
    }

    // Detect if running on GitHub Pages
    detectGitHubPages() {
        return window.location.hostname.includes('github.io') || 
               window.location.hostname === 'localhost' ||
               window.location.protocol === 'file:';
    }

    // Check if a URL is a localhost URL
    isLocalhostUrl(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();
            return this.localhostUrls.includes(hostname) || 
                   hostname === 'localhost' ||
                   hostname.startsWith('192.168.') ||
                   hostname.startsWith('10.') ||
                   hostname === '127.0.0.1';
        } catch (e) {
            return false;
        }
    }

    // Check if the current page is served via HTTP (not HTTPS)
    isHttpProtocol() {
        return window.location.protocol === 'http:';
    }

    // Check for mixed content (HTTPS page trying to fetch HTTP localhost)
    isMixedContent(url) {
        return this.isGitHubPages && this.isHttpProtocol() && this.isLocalhostUrl(url);
    }

    // Get the best CORS solution for the current scenario
    getCorsSolution(url) {
        if (!this.isGitHubPages) {
            return { type: 'none', message: 'Not on GitHub Pages, CORS should work normally' };
        }

        if (this.isMixedContent(url)) {
            return {
                type: 'file_protocol',
                message: 'Use file:// protocol - double-click index.html',
                command: 'file://',
                action: 'Open via file:// protocol'
            };
        }

        if (this.isHttpProtocol() && this.isLocalhostUrl(url)) {
            return {
                type: 'local_server',
                message: 'Run a local server to avoid CORS',
                command: 'python -m http.server 8080',
                action: 'Run local server'
            };
        }

        return {
            type: 'scripts',
            message: 'Use the provided scripts to fetch models',
            command: 'python scripts/fetch_localhost_proxy.py',
            action: 'Use fetch script'
        };
    }

    // Download a file from localhost
    async downloadFile(url, token = null) {
        try {
            const headers = {
                'Accept': 'application/json'
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Response is not valid JSON');
            }

            const data = await response.json();
            
            if (data.object !== 'list') {
                throw new Error(`Expected object=list, got ${data.object}`);
            }

            return { success: true, data: data, url: url };

        } catch (error) {
            // Check if it's a CORS error
            if (error.message.includes('CORS') || error.message.includes('cross-origin')) {
                return { 
                    success: false, 
                    error: 'CORS error - cannot fetch from localhost due to browser security',
                    solution: this.getCorsSolution(url)
                };
            }
            return { success: false, error: error.message };
        }
    }

    // Get all localhost endpoints from the page
    getLocalhostEndpoints() {
        const endpoints = [];
        const endpointRows = document.querySelectorAll('.endpoint-row');
        
        endpointRows.forEach(row => {
            const source = row.querySelector('.ep-source-combo')?.dataset?.source || 'url';
            if (source === 'url') {
                const url = row.querySelector('.ep-url')?.value?.trim();
                const key = row.querySelector('.ep-key')?.value?.trim();
                const name = row.querySelector('.ep-name')?.value?.trim() || url;
                
                if (url && this.isLocalhostUrl(url)) {
                    endpoints.push({
                        url: url,
                        key: key,
                        name: name,
                        row: row
                    });
                }
            }
        });
        
        return endpoints;
    }

    // Show CORS solution to the user
    showCorsSolution(solution, containerId = 'corsHint') {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.classList.remove('hidden');
        
        let html = '<strong>🔒 CORS Issue Detected</strong><br>';
        
        switch (solution.type) {
            case 'file_protocol':
                html += 'Browser <code>https://</code> page cannot fetch <code>http://localhost</code>.<br><br>'
                       + '<strong>Options:</strong><br>'
                       + '• Open this page via <code>file://</code> — double-click <code>index.html</code><br>'
                       + '• Use the <code>.bat</code> / <code>.sh</code> / <code>.py</code> scripts from the Scripts tab';
                break;
                
            case 'local_server':
                html += 'Page via <code>http://</code> cannot cross-origin fetch even to localhost.<br><br>'
                       + '<strong>Options:</strong><br>'
                       + '• Run a local server: <code>python -m http.server 8080</code><br>'
                       + '• Use the <code>.bat</code> / <code>.sh</code> / <code>.py</code> scripts from the Scripts tab';
                break;
                
            case 'scripts':
                html += 'Cannot fetch from localhost due to browser security restrictions.<br><br>'
                       + '<strong>Solution:</strong><br>'
                       + '• Run: <code>python scripts/fetch_localhost_proxy.py <url> [token]</code><br>'
                       + '• This will download the models and save them locally for the web app to read';
                break;
                
            default:
                html += solution.message;
        }
        
        container.innerHTML = html;
    }

    // Auto-detect and handle localhost endpoints
    async autoDetectLocalhost() {
        const detector = this;
        const endpoints = detector.getLocalhostEndpoints();
        
        if (endpoints.length === 0) {
            return { success: false, message: 'No localhost endpoints found' };
        }

        const results = [];
        
        for (const endpoint of endpoints) {
            const token = endpoint.key;
            const result = await detector.downloadFile(endpoint.url, token);
            results.push({
                endpoint: endpoint,
                result: result
            });
        }
        
        return { success: true, results: results };
    }

    // Check if we should show CORS hint
    shouldShowCorsHint(url) {
        return this.isGitHubPages && (
            this.isMixedContent(url) || 
            (this.isHttpProtocol() && this.isLocalhostUrl(url))
        );
    }

    // Get the best URL for the current scenario
    getBestUrl(url) {
        if (this.isGitHubPages && this.isMixedContent(url)) {
            return 'file://index.html';
        }
        return url;
    }
}

// Global instance
const localhostDetector = new LocalhostDetector();

// Utility functions for the web app
function setupLocalhostDetection() {
    // Add event listeners to URL inputs to check for localhost
    document.addEventListener('input', function(e) {
        if (e.target && e.target.classList.contains('ep-url')) {
            const url = e.target.value;
            if (url && localhostDetector.isLocalhostUrl(url)) {
                if (localhostDetector.shouldShowCorsHint(url)) {
                    localhostDetector.showCorsSolution(localhostDetector.getCorsSolution(url));
                } else {
                    document.getElementById('corsHint')?.classList.add('hidden');
                }
            }
        }
    });

    // Add button to fetch all localhost endpoints
    const fetchBtn = document.getElementById('fetchBtn');
    if (fetchBtn) {
        const originalClick = fetchBtn.onclick;
        fetchBtn.onclick = async function(e) {
            // Check if there are localhost endpoints
            const endpoints = localhostDetector.getLocalhostEndpoints();
            if (endpoints.length > 0) {
                e.preventDefault();
                await handleLocalhostEndpoints();
                return false;
            }
            return originalClick ? originalClick(e) : false;
        };
    }

    // Add a button to manually trigger localhost detection
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        const originalSetStatus = window.setStatus;
        window.setStatus = function(msg, type = 'info') {
            originalSetStatus(msg, type);
            
            // Check if the message indicates localhost issues
            if (msg.includes('localhost') || msg.includes('CORS') || msg.includes('mixed content')) {
                const url = document.querySelector('.ep-url')?.value;
                if (url && localhostDetector.shouldShowCorsHint(url)) {
                    localhostDetector.showCorsSolution(localhostDetector.getCorsSolution(url));
                }
            }
        };
    }
}

async function handleLocalhostEndpoints() {
    const detector = localhostDetector;
    const endpoints = detector.getLocalhostEndpoints();
    
    if (endpoints.length === 0) {
        setStatus('No localhost endpoints found', 'warn');
        return;
    }

    setStatus(`Found ${endpoints.length} localhost endpoint(s). Fetching...`, 'info');
    
    const results = [];
    
    for (const endpoint of endpoints) {
        try {
            const result = await detector.downloadFile(endpoint.url, endpoint.key);
            results.push({ endpoint: endpoint, result: result });
            
            if (result.success) {
                setStatus(`✅ ${endpoint.name}: ${result.data.data.length} models fetched`, 'success');
            } else {
                setStatus(`❌ ${endpoint.name}: ${result.error}`, 'err');
                if (result.solution) {
                    detector.showCorsSolution(result.solution);
                }
            }
        } catch (error) {
            setStatus(`❌ ${endpoint.name}: ${error.message}`, 'err');
        }
    }
    
    // Show summary
    const successCount = results.filter(r => r.result.success).length;
    const errorCount = results.length - successCount;
    
    if (successCount > 0) {
        setStatus(`✅ Successfully fetched ${successCount} endpoint(s), ${errorCount} failed`, 'info');
    } else {
        setStatus(`❌ All ${endpoints.length} endpoints failed`, 'err');
    }
}

// Initialize localhost detection when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupLocalhostDetection);
} else {
    setupLocalhostDetection();
}

// Export for use in other scripts
window.LocalhostDetector = LocalhostDetector;
window.localhostDetector = localhostDetector;
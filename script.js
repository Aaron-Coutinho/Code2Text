const dropZone = document.getElementById('drop-zone');
const folderInput = document.getElementById('folder-input');
const resultView = document.getElementById('result-view');
const fileListElement = document.getElementById('file-list');
const downloadBtn = document.getElementById('download-btn');
const resetBtn = document.getElementById('reset-btn');
const addMoreBtn = document.getElementById('add-more-btn');
const masterSelect = document.getElementById('master-select');
const customIgnoreInput = document.getElementById('custom-ignore-input');
const processingView = document.getElementById('processing-view');
const fileCountParams = document.getElementById('file-count');
const totalSizeParams = document.getElementById('total-size');

// Ignore Patterns
const IGNORED_DIRS = new Set([
    'node_modules', '.git', '.vscode', '.idea', 'dist', 'build', 'bin', 'obj',
    '__pycache__', 'venv', 'env', '.venv', '.next', '.nuxt', 'out', 'target', 'vendor',
    'coverage', '.mypy_cache', '.pytest_cache', 'tmp', 'temp'
]);

const IGNORED_FILES = new Set([
     'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock', 
     '.DS_Store', 'Thumbs.db', 'LICENSE', 'README.md', '.env', '.gitignore'
]);

// Extension categories to ignore
const IGNORED_EXTENSIONS = new Set([
    // Images
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico', '.webp', '.tiff', '.psd', '.ai', '.xcf',
    // Audio/Video
    '.mp3', '.wav', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv',
    // Executables/Binaries
    '.exe', '.dll', '.so', '.dylib', '.bin', '.iso', '.msi', '.app',
    // Archives
    '.zip', '.tar', '.gz', '.rar', '.7z', '.jar', '.war',
    // Models/Weights
    '.pth', '.onnx', '.h5', '.pb', '.pkl', '.safetensors', '.tflite', '.pt',
    // Documents/Fonts
    '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.ttf', '.otf', '.woff', '.woff2',
    // Source maps & Minified
    '.map', '.min.js', '.min.css'
]);

// State
let allFiles = []; // { path: string, file: File, mode: string ('full', 'partial', 'path', 'exclude'), size: number }

// --- Event Listeners ---

// Drag & Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    // WebkitGetAsEntry is needed for recursive folder traversal logic if we want to support full folder drag-n-drop nicely
    // access entry through items
    const items = e.dataTransfer.items;
    if (items) {
        handleItems(items);
    }
});

// Add More Button
addMoreBtn.addEventListener('click', () => {
    folderInput.click();
});

// File Input
folderInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFiles(Array.from(e.target.files));
    }
});

function getCustomIgnores() {
    const val = customIgnoreInput ? customIgnoreInput.value : '';
    if (!val.trim()) return new Set();
    const parts = val.split(',').map(s => s.trim()).filter(Boolean);
    return new Set(parts);
}

function handleItems(items) {
    // This is a bit more complex for full folder tree support via DnD API
    // For simplicity in this robust MVP, we'll try to use the File API if possible or just encourage strict folder input
    // But actually, folderInput handles recursive pretty well.
    // Let's rely on standard FileList from the input for now to be safe, 
    // or if items are provided, scan them.
    
    // If dropped items are files, we can just read them.
    // If dropped items are folders, we need FileSystemEntry.
    
    const entries = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.webkitGetAsEntry) {
            entries.push(item.webkitGetAsEntry());
        }
    }

    if (entries.length > 0) {
        setLoading(true);
        // Small timeout to render loader
        setTimeout(async () => {
            const files = await scanEntries(entries);
            await processFiles(files);
            setLoading(false); 
        }, 100);
    }
}

function handleFiles(fileList) {
    setLoading(true);
    setTimeout(async () => {
        // fileList is a flat list from <input>
        // We just need to filter it.
        // It already contains relative paths in `webkitRelativePath` usually.
        await processFiles(fileList);
        setLoading(false);
    }, 100);
}


// --- Logic ---

async function scanEntries(entries) {
    let files = [];
    for (const entry of entries) {
        if (entry.isFile) {
            const file = await getFileFromEntry(entry);
            // Manually add fullPath if missing, or use entry.fullPath
            // entry.fullPath usually starts with /
            file.fullPath = entry.fullPath.substring(1); 
            files.push(file);
        } else if (entry.isDirectory) {
            const dirFiles = await scanDir(entry);
            files = files.concat(dirFiles);
        }
    }
    return files;
}

async function scanDir(dirEntry) {
    const reader = dirEntry.createReader();
    // readEntries need to be called recursively until empty in some browsers, but usually once is enough for small batch
    // We will do a Promisified read
    const entries = await new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
    });
    
    let files = [];
    for (const entry of entries) {
        if (entry.isFile) {
             const file = await getFileFromEntry(entry);
             file.fullPath = entry.fullPath.substring(1);
             files.push(file);
        } else if (entry.isDirectory) {
            // Check ignore dirs early?
            const customIgnores = getCustomIgnores();
            if (IGNORED_DIRS.has(entry.name) || customIgnores.has(entry.name)) continue;
            
            const subFiles = await scanDir(entry);
            files = files.concat(subFiles);
        }
    }
    return files;
}

function getFileFromEntry(fileEntry) {
    return new Promise((resolve, reject) => {
        fileEntry.file(resolve, reject);
    });
}

function detectLargeDirsAndPrompt(rawFiles) {
    return new Promise((resolve) => {
        const threshold = 300;
        const dirCounts = {};
        for(const f of rawFiles) {
            let path = f.webkitRelativePath || f.fullPath || f.name;
            path = path.replace(/\\/g, '/');
            const parts = path.split('/');
            
            // Skip root. Start from 1st level subdirectories.
            if (parts.length > 2) {
                let currentPath = parts[0];
                for (let i = 1; i < parts.length - 1; i++) {
                     currentPath += "/" + parts[i];
                     dirCounts[currentPath] = (dirCounts[currentPath] || 0) + 1;
                }
            }
        }
        
        let largeDirs = Object.entries(dirCounts)
            .filter(([dir, count]) => count > threshold)
            .map(([dir, count]) => ({ dir, count }));
            
        let topLargeDirs = [];
        for (const ld of largeDirs) {
             const hasLargeParent = largeDirs.some(p => ld.dir !== p.dir && ld.dir.startsWith(p.dir + '/'));
             if (!hasLargeParent) topLargeDirs.push(ld);
        }
        
        if (topLargeDirs.length === 0) {
            resolve("keep");
            return;
        }
        
        // Show Modal
        const modal = document.getElementById('large-folder-modal');
        const listContainer = document.getElementById('culprit-list');
        listContainer.innerHTML = '';
        
        topLargeDirs.sort((a,b) => b.count - a.count).forEach(ld => {
            const li = document.createElement('li');
            li.innerHTML = `<span>📂 ${ld.dir}</span> <span style="color:#f59e0b">${ld.count} files</span>`;
            listContainer.appendChild(li);
        });
        
        modal.classList.remove('hidden');
        
        // Handlers
        let btnExclude = document.getElementById('modal-btn-exclude');
        let btnPath = document.getElementById('modal-btn-path');
        let btnKeep = document.getElementById('modal-btn-keep');
        
        const finish = (action) => {
             modal.classList.add('hidden');
             // remove listeners to prevent memory leaks if called multiple times
             btnExclude.replaceWith(btnExclude.cloneNode(true));
             btnPath.replaceWith(btnPath.cloneNode(true));
             btnKeep.replaceWith(btnKeep.cloneNode(true));
             resolve({ action, dirs: topLargeDirs.map(d => d.dir) });
        };
        
        // Setup new fresh buttons from DOM after clone
        btnExclude = document.getElementById('modal-btn-exclude');
        btnPath = document.getElementById('modal-btn-path');
        btnKeep = document.getElementById('modal-btn-keep');

        btnExclude.addEventListener('click', () => finish("exclude"));
        btnPath.addEventListener('click', () => finish("path"));
        btnKeep.addEventListener('click', () => finish("keep"));
    });
}


async function processFiles(rawFiles) {
    // We explicitly do NOT clear allFiles = []; here to make it additive.
    const customIgnores = getCustomIgnores();
    
    // Check for massive directories
    const promptResult = await detectLargeDirsAndPrompt(rawFiles);
    
    let finalRawFiles = rawFiles;
    let pathsToAdd = [];

    if (promptResult !== "keep") {
        const { action, dirs } = promptResult;
        
        finalRawFiles = rawFiles.filter(f => {
             let path = f.webkitRelativePath || f.fullPath || f.name;
             path = path.replace(/\\/g, '/');
             return !dirs.some(d => path.startsWith(d + '/'));
        });
        
        if (action === 'path') {
             // For path only, manually inject an empty fake file representing the directory
             dirs.forEach(d => {
                 pathsToAdd.push({
                     file: null, // No file object needed for path
                     path: d + '/',
                     size: 0,
                     mode: 'path'
                 });
             });
        }
    }
    
    for (const file of finalRawFiles) {
        // Determine path
        // Priority: file.webkitRelativePath (from input), file.fullPath (from DnD logic we added), file.name
        let path = file.webkitRelativePath || file.fullPath || file.name;
        
        // Normalize path separator
        path = path.replace(/\\/g, '/');
        
        const pathParts = path.split('/');
        const fileName = pathParts[pathParts.length - 1];
        
        // 1. Check Directory Ignores
        // If any part of the path matches an ignored directory
        // Example: my-project/node_modules/library/index.js
        const hasIgnoredDir = pathParts.some(part => IGNORED_DIRS.has(part) || customIgnores.has(part));
        if (hasIgnoredDir) continue;

        // 2. Check File Ignores
        if (IGNORED_FILES.has(fileName)) continue;

        // 3. Check Extension Ignores
        // Get extension including dot, lowercase
        const lastDotIndex = fileName.lastIndexOf('.');
        if (lastDotIndex !== -1) {
            const ext = fileName.substring(lastDotIndex).toLowerCase();
            if (IGNORED_EXTENSIONS.has(ext)) continue;
        }

        // 4. Duplicate Check (Additive Drop Support)
        if (allFiles.some(f => f.path === path)) continue;

        // Special handling: CSV files
        // We include them but maybe uncheck them by default if large? 
        // For now, let's include them and let user decide.
        
        // Uncheck files larger than 1MB by default to prevent accidental massive text files
        const isOversized = file.size > 1024 * 1024; // 1 MB

        allFiles.push({
            file: file,
            path: path,
            size: file.size,
            mode: isOversized ? 'exclude' : 'full' // Default mode based on size
        });
    }

    // Append any artificial path-only records 
    pathsToAdd.forEach(p => {
        if (!allFiles.some(f => f.path === p.path)) {
            allFiles.push(p);
        }
    });

    renderFileList();
    updateStats();
    
    dropZone.classList.add('hidden');
    resultView.classList.remove('hidden');
}


function renderFileList() {
    fileListElement.innerHTML = '';
    
    allFiles.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = `file-item ${item.mode}`;
        
        const select = document.createElement('select');
        select.className = 'modern-select item-select';
        
        const options = [
            { value: 'full', label: 'Full Content' },
            { value: 'partial', label: 'First 5 Lines' },
            { value: 'path', label: 'Path Only' },
            { value: 'exclude', label: 'Exclude' }
        ];
        
        options.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.value;
            el.textContent = opt.label;
            if (item.mode === opt.value) el.selected = true;
            select.appendChild(el);
        });
        
        select.addEventListener('change', (e) => {
            item.mode = e.target.value;
            li.className = `file-item ${item.mode}`; // Update opacity styles
            updateStats();
        });
        
        const pathSpan = document.createElement('span');
        pathSpan.className = 'file-path';
        pathSpan.textContent = item.path;
        pathSpan.title = item.path; // Tooltip
        
        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'file-size';
        sizeSpan.textContent = formatSize(item.size);

        li.appendChild(select);
        li.appendChild(pathSpan);
        li.appendChild(sizeSpan);
        
        fileListElement.appendChild(li);
    });
}

function updateStats() {
    const includedFiles = allFiles.filter(f => f.mode !== 'exclude');
    
    fileCountParams.textContent = `${includedFiles.length} files included`;
    // For size, maybe only sum up 'full' and 'partial', ignoring 'path' because it's just the string size
    let approximateBytes = 0;
    includedFiles.forEach(f => {
        if (f.mode === 'full') approximateBytes += f.size;
        // For partial, we don't know exact size of 5 lines, let's just make a small guess or count as 0 to save complexity
        else if (f.mode === 'partial') approximateBytes += Math.min(f.size, 500); 
    });
    
    totalSizeParams.textContent = `~ ${formatSize(approximateBytes)}`;
}

// Master Select Toggle
masterSelect.addEventListener('change', (e) => {
    const mode = e.target.value;
    allFiles.forEach(f => {
        f.mode = mode;
    });
    renderFileList(); // Re-render to update all dropdowns visually
    updateStats();
    // Reset master select back to default label look to show it's an action rather than a state
    e.target.selectedIndex = 0; 
});

// Reset
resetBtn.addEventListener('click', () => {
    allFiles = [];
    resultView.classList.add('hidden');
    dropZone.classList.remove('hidden');
    folderInput.value = ''; // Reset input
});


// Download Logic
downloadBtn.addEventListener('click', async () => {
    const selectedFiles = allFiles.filter(f => f.mode !== 'exclude');
    
    if (selectedFiles.length === 0) {
        showToast("Please select at least one file.", "warning");
        return;
    }

    const buttonOriginalText = downloadBtn.innerHTML;
    downloadBtn.textContent = 'Generating...';
    downloadBtn.disabled = true;

    try {
        const consolidatedContent = await generateContent(selectedFiles);
        downloadFile(consolidatedContent, 'project_context.txt');
        showToast("Context file generated successfully!", "success");
    } catch (err) {
        console.error(err);
        showToast("Error generating file. See console for details.", "error");
    } finally {
        downloadBtn.innerHTML = buttonOriginalText;
        downloadBtn.disabled = false;
    }
});

async function generateContent(files) {
    // Sort files by path for consistency
    files.sort((a, b) => a.path.localeCompare(b.path));
    
    const parts = [];
    
    for (const item of files) {
        if (item.mode === 'exclude') continue;

        if (item.mode === 'path') {
             parts.push(`${item.path}-\n[Content Excluded]\n`);
             continue;
        }

        try {
            let content = await readFileContent(item.file);
            
            if (item.mode === 'partial') {
                const lines = content.split('\n');
                if (lines.length > 5) {
                    content = lines.slice(0, 5).join('\n') + '\n\n... [More content present - truncated for partial preview]';
                }
            }

            parts.push(`${item.path}-\n${content}\n`);
        } catch (err) {
            console.warn(`Could not read file ${item.path}`, err);
            parts.push(`${item.path}-\n[Error reading file or binary content detected]\n`);
        }
    }
    
    return parts.join('\n' + '='.repeat(30) + '\n\n');
}

function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            // Check for null bytes (common indicator of binary files)
            // We check the first 1024 characters for performance
            const sample = text.substring(0, 1024);
            if (sample.indexOf('\u0000') !== -1) {
                resolve('[Binary or non-text file skipped - detected null bytes]');
                return;
            }
            resolve(text);
        };
        reader.onerror = (e) => reject(e);
        // Read as text. Null bytes will be preserved in the JS string representation.
        reader.readAsText(file);
    });
}

function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Utils
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function setLoading(isLoading) {
    if (isLoading) {
        dropZone.classList.add('hidden');
        processingView.classList.remove('hidden');
    } else {
        processingView.classList.add('hidden');
        // resultView is shown by logic
    }
}

// --- Custom Toasts ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Icon based on type
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 3000);
}

// --- Easter Egg: Context Snake ---
const easterEggBtn = document.getElementById('easter-egg-btn');
const gameModal = document.getElementById('game-modal');
const closeGameBtn = document.getElementById('close-game-btn');
const startGameBtn = document.getElementById('start-game-btn');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('game-score-display');
const finalScoreSpan = document.getElementById('final-score');
const gameOverlay = document.getElementById('game-overlay');

let snake = [];
let food = {};
let dx = 20;
let dy = 0;
let score = 0;
let gameInterval;
let gameRunning = false;

easterEggBtn.addEventListener('click', () => {
    gameModal.classList.remove('hidden');
});

closeGameBtn.addEventListener('click', () => {
    gameModal.classList.add('hidden');
    stopGame();
});

startGameBtn.addEventListener('click', startGame);

function initGame() {
    snake = [
        {x: 200, y: 200},
        {x: 180, y: 200},
        {x: 160, y: 200}
    ];
    score = 0;
    dx = 20;
    dy = 0;
    createFood();
}

function startGame() {
    initGame();
    gameRunning = true;
    gameOverlay.classList.add('hidden');
    scoreDisplay.classList.add('hidden');
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(main, 100);
}

function stopGame() {
    gameRunning = false;
    clearInterval(gameInterval);
    gameOverlay.classList.remove('hidden');
    startGameBtn.textContent = "Play Again";
    scoreDisplay.classList.remove('hidden');
    finalScoreSpan.textContent = score;
}

function main() {
    if (hasGameEnded()) {
        stopGame();
        return;
    }
    clearCanvas();
    drawFood();
    advanceSnake();
    drawSnake();
}

function clearCanvas() {
    ctx.fillStyle = "#0f172a";
    ctx.strokeStyle = "#1e293b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
}

function drawSnakePart(snakePart) {
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#0ea5e9';
    ctx.fillRect(snakePart.x, snakePart.y, 20, 20);
    ctx.strokeRect(snakePart.x, snakePart.y, 20, 20);
}

function drawSnake() {
    snake.forEach(drawSnakePart);
}

function advanceSnake() {
    const head = {x: snake[0].x + dx, y: snake[0].y + dy};
    snake.unshift(head);
    const didEatFood = snake[0].x === food.x && snake[0].y === food.y;
    if (didEatFood) {
        score += 10;
        createFood();
    } else {
        snake.pop();
    }
}

function randomTen(min, max) {
    return Math.round((Math.random() * (max-min) + min) / 20) * 20;
}

function createFood() {
    food.x = randomTen(0, canvas.width - 20);
    food.y = randomTen(0, canvas.height - 20);
    snake.forEach(function isFoodOnSnake(part) {
        if (part.x == food.x && part.y == food.y) createFood();
    });
}

function drawFood() {
    ctx.fillStyle = '#ec4899';
    ctx.strokeStyle = '#be185d';
    ctx.fillRect(food.x, food.y, 20, 20);
    ctx.strokeRect(food.x, food.y, 20, 20);
}

function hasGameEnded() {
    for (let i = 4; i < snake.length; i++) {
        if (snake[i].x === snake[0].x && snake[i].y === snake[0].y) return true;
    }
    const hitLeftWall = snake[0].x < 0;
    const hitRightWall = snake[0].x >= canvas.width;
    const hitToptWall = snake[0].y < 0;
    const hitBottomWall = snake[0].y >= canvas.height;
    return hitLeftWall || hitRightWall || hitToptWall || hitBottomWall;
}

document.addEventListener("keydown", changeDirection);

function changeDirection(event) {
    const LEFT_KEY = 37;
    const RIGHT_KEY = 39;
    const UP_KEY = 38;
    const DOWN_KEY = 40;

    if (!gameRunning) return;

    const keyPressed = event.keyCode;
    const goingUp = dy === -20;
    const goingDown = dy === 20;
    const goingRight = dx === 20;
    const goingLeft = dx === -20;

    if (keyPressed === LEFT_KEY && !goingRight) { dx = -20; dy = 0; }
    if (keyPressed === UP_KEY && !goingDown) { dx = 0; dy = -20; }
    if (keyPressed === RIGHT_KEY && !goingLeft) { dx = 20; dy = 0; }
    if (keyPressed === DOWN_KEY && !goingUp) { dx = 0; dy = 20; }
    
    // Prevent default scrolling for arrow keys while playing
    if([37, 38, 39, 40].indexOf(event.keyCode) > -1) {
        event.preventDefault();
    }
}

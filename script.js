const dropZone = document.getElementById('drop-zone');
const folderInput = document.getElementById('folder-input');
const resultView = document.getElementById('result-view');
const fileListElement = document.getElementById('file-list');
const downloadBtn = document.getElementById('download-btn');
const resetBtn = document.getElementById('reset-btn');
const selectAllCheckbox = document.getElementById('select-all');
const processingView = document.getElementById('processing-view');
const fileCountParams = document.getElementById('file-count');
const totalSizeParams = document.getElementById('total-size');

// Ignore Patterns
const IGNORED_DIRS = new Set([
    'node_modules', '.git', '.vscode', '.idea', 'dist', 'build', 'bin', 'obj',
    '__pycache__', 'venv', 'env', '.next', '.nuxt', 'out', 'target', 'vendor',
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
let allFiles = []; // { path: string, file: File, selected: boolean, size: number }

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

// File Input
folderInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFiles(Array.from(e.target.files));
    }
});

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
        setTimeout(() => {
            scanEntries(entries).then(files => {
                processFiles(files);
                setLoading(false); 
            });
        }, 100);
    }
}

function handleFiles(fileList) {
    setLoading(true);
    setTimeout(() => {
        // fileList is a flat list from <input>
        // We just need to filter it.
        // It already contains relative paths in `webkitRelativePath` usually.
        processFiles(fileList);
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
            if (IGNORED_DIRS.has(entry.name)) continue;
            
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


function processFiles(rawFiles) {
    allFiles = [];
    
    for (const file of rawFiles) {
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
        const hasIgnoredDir = pathParts.some(part => IGNORED_DIRS.has(part));
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

        // Special handling: CSV files
        // We include them but maybe uncheck them by default if large? 
        // For now, let's include them and let user decide.
        
        // Uncheck files larger than 1MB by default to prevent accidental massive text files
        const isOversized = file.size > 1024 * 1024; // 1 MB

        allFiles.push({
            file: file,
            path: path,
            size: file.size,
            selected: !isOversized // Unchecked if oversized
        });
    }

    renderFileList();
    updateStats();
    
    dropZone.classList.add('hidden');
    resultView.classList.remove('hidden');
}


function renderFileList() {
    fileListElement.innerHTML = '';
    
    allFiles.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        
        const label = document.createElement('label');
        label.className = 'checkbox-container';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.selected;
        checkbox.addEventListener('change', (e) => {
            item.selected = e.target.checked;
            updateStats();
            updateSelectAllState();
        });
        
        const checkmark = document.createElement('span');
        checkmark.className = 'checkmark';
        
        label.appendChild(checkbox);
        label.appendChild(checkmark);
        
        const pathSpan = document.createElement('span');
        pathSpan.className = 'file-path';
        pathSpan.textContent = item.path;
        pathSpan.title = item.path; // Tooltip
        
        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'file-size';
        sizeSpan.textContent = formatSize(item.size);

        // Visual cue for unselected default files
        if (!item.selected) {
            li.style.opacity = '0.6';
        }
        checkbox.addEventListener('change', (e) => {
             li.style.opacity = e.target.checked ? '1' : '0.6';
        });

        li.appendChild(label);
        li.appendChild(pathSpan);
        li.appendChild(sizeSpan);
        
        fileListElement.appendChild(li);
    });
}

function updateStats() {
    const selectedCount = allFiles.filter(f => f.selected).length;
    const totalSize = allFiles.filter(f => f.selected).reduce((acc, f) => acc + f.size, 0);
    
    fileCountParams.textContent = `${selectedCount} files selected`;
    totalSizeParams.textContent = formatSize(totalSize);
}

function updateSelectAllState() {
    const allSelected = allFiles.every(f => f.selected);
    const someSelected = allFiles.some(f => f.selected);
    
    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.indeterminate = someSelected && !allSelected;
}

// Select All Toggle
selectAllCheckbox.addEventListener('change', (e) => {
    const checked = e.target.checked;
    allFiles.forEach(f => {
        f.selected = checked;
        // Also update opacity of list items visually
        const listItems = fileListElement.querySelectorAll('.file-item');
        if(listItems.length === allFiles.length) {
            Array.from(listItems).forEach(li => li.style.opacity = checked ? '1' : '0.6');
        }
    });
    renderFileList(); // Re-render to update checkboxes
    updateStats();
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
    const selectedFiles = allFiles.filter(f => f.selected);
    
    if (selectedFiles.length === 0) {
        alert("Please select at least one file.");
        return;
    }

    const buttonOriginalText = downloadBtn.innerHTML;
    downloadBtn.textContent = 'Generating...';
    downloadBtn.disabled = true;

    try {
        const consolidatedContent = await generateContent(selectedFiles);
        downloadFile(consolidatedContent, 'project_context.txt');
    } catch (err) {
        console.error(err);
        alert("Error generating file. See console for details.");
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
        try {
            const content = await readFileContent(item.file);
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

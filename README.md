# Project Context Consolidator

A sleek, 100% client-side web application designed to help developers quickly bundle their entire project codebase into a single, AI-ready text file. 

When working with Large Language Models (LLMs) like ChatGPT, Claude, or Gemini, providing context is often the biggest hurdle. Manually copying and pasting multiple files is tedious and error-prone. This tool solves that by allowing you to drag and drop your project folder and instantly generate a formatted text file containing all your code, complete with file paths.

![Context Consolidator UI](https://via.placeholder.com/800x450.png?text=Premium+Glassmorphism+UI)

## 🚀 Features

- **Drag & Drop Interface**: Seamlessly drag your entire project folder directly into the browser.
- **100% Secure & Local**: All processing happens client-side in your browser. No files are ever uploaded to any server.
- **Smart Filtering**: Automatically ignores noise:
  - Version control (`.git`)
  - Dependencies (`node_modules`, `venv`, `vendor`)
  - Build outputs (`dist`, `build`, `out`)
  - Binary files and media (`.png`, `.exe`, `.mp4`, etc.)
- **Selective Inclusion**: Review the list of detected files and uncheck any you don't want to include before generating the final file.
- **Premium UI**: Enjoy a beautiful, responsive glassmorphism design with animated gradient backgrounds.
- **AI-Optimized Output**: The generated `.txt` file is formatted with clear separators and file path headers, making it easy for LLMs to parse and understand your project structure.

## 🛠️ How to Use

1. **Open the App**: Since it's a static web app, simply open `index.html` in your favorite modern web browser.
2. **Select Folder**: Drag and drop your project folder into the designated drop zone, or click to browse and select a folder.
3. **Review**: The app will recursively scan the folder, applying smart filters. It will present a list of files it intends to bundle.
4. **Customize (Optional)**: Check or uncheck specific files if you want to exclude certain things.
5. **Download**: Click "Download Context File".
6. **Use with AI**: Open the downloaded `project_context.txt` file, copy its contents, and paste it into your AI assistant.

## 💻 Technical Details

The application is built using standard web technologies:
*   **HTML5**: Structure and semantics, utilizing the `webkitdirectory` attribute for folder selection.
*   **CSS3**: Styling, featuring custom CSS variables, flexbox, glassmorphism effects (`backdrop-filter`), and CSS animations.
*   **Vanilla JavaScript**: Core logic handling the Drag and Drop API, File and Directory Entries API, and Blob generation for local downloading.

## 🧠 Why Build This?

Switching between different AI models or starting a new session often means losing the context of your current codebase. By consolidating the relevant files into one document, you can easily "hydrate" any AI with your project's current state in seconds.

## 🤝 Contributing

Feel free to fork this project, submit pull requests, or open issues if you find bugs or have feature requests (like supporting `.gitignore` parsing or custom exclusion rules!).

## 📄 License

This project is open-source and available under the MIT License.

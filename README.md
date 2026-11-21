
# Real-Time Collaborative Code & Whiteboard Editor

## Project Description

The Real-Time Collaborative Code & Whiteboard Editor is a web-based application that allows multiple users to collaborate in real time.

Users can write and edit code, draw on a shared whiteboard, communicate through real-time chat, and manage documents together.

## Features

- User Registration and Login
- Forgot Password and Password Reset
- User Profile and Profile Picture
- Real-Time Collaborative Code Editor
- Multiple Programming Language Support
- Real-Time Code Synchronization
- Collaborative Whiteboard
- Drawing Tools
- Real-Time Chat
- Online Users
- Document Management
- User Invitations and Permissions
- Viewer and Editor Access Control
- Version History
- Restore Previous Versions

## Technologies Used

### Frontend
- React.js
- JavaScript
- HTML
- CSS
- Monaco Editor
- Socket.IO Client

### Backend
- Node.js
- Express.js
- Socket.IO
- MongoDB
- Mongoose
- JWT Authentication
- Nodemailer

## Project Structure

    realtime-editor/
    |
    |-- client/
    |   |-- src/
    |   |-- public/
    |   |-- package.json
    |
    |-- server/
    |   |-- models/
    |   |-- routes/
    |   |-- server.js
    |   |-- package.json
    |
    |-- README.md

## Installation Guide

### 1. Clone the Repository

    git clone YOUR_GITHUB_REPOSITORY_URL

### 2. Open the Project Folder

    cd realtime-editor

### 3. Install Backend Dependencies

    cd server
    npm install

### 4. Install Frontend Dependencies

Open another terminal:

    cd client
    npm install

## Environment Variables

Create a `.env` file inside the `server` folder.

Add the required environment variables:

    PORT=5000
    MONGO_URI=your_mongodb_connection_string
    JWT_SECRET=your_jwt_secret
    EMAIL_USER=your_email@gmail.com
    EMAIL_PASS=your_gmail_app_password

Replace the example values with your actual configuration.

Never upload your real passwords, secrets, or `.env` file to GitHub.

## How to Run the Project

### Start the Backend

Open a terminal:

    cd server
    node server.js

Backend runs at:

    http://localhost:5000

### Start the Frontend

Open another terminal:

    cd client
    npm run dev

Frontend runs at:

    http://localhost:5173

Open the frontend URL in your browser.

## How to Use

1. Register a new account.
2. Log in to the application.
3. Create or open a collaborative document.
4. Invite other users to collaborate.
5. Write code together in real time.
6. Use the whiteboard to draw and share ideas.
7. Communicate using the real-time chat.
8. View previous versions and restore code when needed.

## Security

- Password-based authentication.
- JWT-based authorization.
- User access permissions.
- Password reset through email.
- Environment variables for sensitive configuration.

## Author

Developed as part of the IT-Simplera Solutions Full Stack Development Internship Project.

**Batch:** 02

**Project:** 01

## License

This project was developed for educational and internship purposes.

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const errorDisplay = document.getElementById('error-msg');

    if (localStorage.getItem('vmcrypt_session')) {
        window.location.replace('../index.html');
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value;

        if (!user || !pass) {
            errorDisplay.innerText = "Credentials cannot be empty.";
            return;
        }

        try {
            const db = JSON.parse(localStorage.getItem('vmcrypt_users') || '{}');
            
            if (db.hasOwnProperty(user) && db[user] === pass) {
                localStorage.setItem('vmcrypt_session', user);
                window.location.replace('../index.html');
            } else {
                errorDisplay.innerText = "Invalid username or password.";
                const inputFields = document.querySelectorAll('input');
                inputFields.forEach(input => {
                    input.style.borderColor = '#ef4444';
                    setTimeout(() => input.style.borderColor = '#1e293b', 2000);
                });
            }
        } catch (err) {
            errorDisplay.innerText = "System error: Local storage corrupted.";
            localStorage.removeItem('vmcrypt_users'); 
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('register-form');
    const errorMsg = document.getElementById('reg-error');

    if (localStorage.getItem('vmcrypt_session')) {
        window.location.replace('../index.html');
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value;

        if (!username || !password) {
            errorMsg.innerText = "All fields are required.";
            return;
        }

        if (username.length < 3) {
            errorMsg.innerText = "Username too short (min 3 chars).";
            return;
        }

        if (password.length < 6) {
            errorMsg.innerText = "Password too weak (min 6 chars).";
            return;
        }

        try {
            const db = JSON.parse(localStorage.getItem('vmcrypt_users') || '{}');
            
            if (db.hasOwnProperty(username)) {
                errorMsg.innerText = "Username unavailable.";
                return;
            }

            db[username] = password;
            localStorage.setItem('vmcrypt_users', JSON.stringify(db));
            localStorage.setItem('vmcrypt_session', username);
            
            window.location.replace('../index.html');
        } catch (err) {
            errorMsg.innerText = "Storage error. Clear browser cache.";
        }
    });
});

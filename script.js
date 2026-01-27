document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isLight = body.getAttribute('data-theme') === 'light';
            body.setAttribute('data-theme', isLight ? 'dark' : 'light');
        });
    }

    const modal = document.getElementById("pricing-modal");
    const btnPricing = document.getElementById("btn-pricing");
    const spanClose = document.querySelector(".close-modal");

    if (btnPricing && modal) {
        btnPricing.onclick = function() {
            modal.style.display = "block";
        }
    }

    if (spanClose && modal) {
        spanClose.onclick = function() {
            modal.style.display = "none";
        }
    }

    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            e.preventDefault();
            const target = document.querySelector(targetId);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
});
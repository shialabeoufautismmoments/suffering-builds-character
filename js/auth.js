// Handles the "Owner Login" link and the redirect Netlify Identity needs
// after someone clicks an invite/confirmation link in their email.
if (window.netlifyIdentity) {
  netlifyIdentity.on("init", user => {
    if (!user) {
      netlifyIdentity.on("login", () => {
        document.location.href = "/admin/";
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const loginLink = document.getElementById("owner-login");
  if (loginLink && window.netlifyIdentity) {
    loginLink.addEventListener("click", e => {
      e.preventDefault();
      netlifyIdentity.open();
    });
  }
});

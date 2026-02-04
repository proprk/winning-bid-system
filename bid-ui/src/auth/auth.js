export function getToken() {
    return localStorage.getItem('token');
}

export function setToken(token) {
    return localStorage.setItem('token', token)
}

export function logout() {
    return localStorage.removeItem('token')
}

export function isAuthenticated() {
    return !!getToken();
}
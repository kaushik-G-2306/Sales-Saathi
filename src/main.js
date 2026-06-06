import './db.js';
import './auth.js';
import './styles.css';

/**
 * Shared Utility Module for Date Handling
 * Standard formatting timezone: Asia/Kolkata (IST)
 * Database storage continues to use UTC via TIMESTAMPTZ.
 */

// Helper to get formatted parts in IST
function getISTParts(date) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    
    const parts = formatter.formatToParts(date);
    const p = {};
    parts.forEach(part => {
        p[part.type] = part.value;
    });
    return p;
}

/**
 * Format complete datetime
 * Example: 06 Jun 2026, 10:00 AM IST
 */
window.formatIST = function(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    const p = getISTParts(date);
    const timeStr = `${p.hour}:${p.minute} ${p.dayPeriod}`.toUpperCase();
    return `${p.day} ${p.month} ${p.year}, ${timeStr} IST`;
};

/**
 * Format only date
 * Example: 06 Jun 2026
 */
window.formatDateIST = function(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    const p = getISTParts(date);
    return `${p.day} ${p.month} ${p.year}`;
};

/**
 * Format only time
 * Example: 10:00 AM IST
 */
window.formatTimeIST = function(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    const p = getISTParts(date);
    const timeStr = `${p.hour}:${p.minute} ${p.dayPeriod}`.toUpperCase();
    return `${timeStr} IST`;
};

/**
 * Format relative time
 * Examples: 2 hours ago, Yesterday, 3 days ago
 */
window.formatRelativeTime = function(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    
    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 30) return `${diffDay} days ago`;
    
    // Fallback to regular date for older dates
    return window.formatDateIST(dateString);
};

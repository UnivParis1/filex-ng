function array_sum(arr) {
    let r = 0;
    arr.forEach(function (elt) { r += elt })
    return r;
}

function exception_to_null(f) {
    try { return f() } catch (e) { return null }
}

function encode_params(params) {
    var k;
    var r = [];
    for (k in params) {
        if (params[k]) {
            r.push(k + "=" + encodeURIComponent(params[k]));
        }
    }
    return r.join('&');
}
function addDays(date, days) {
    var r = new Date(date);
    r.setTime(r.getTime() + days * 60 * 60 * 24 * 1000);
    return r;
}
function throttle_some(func, timeFrame) {
    var lastTime = 0;
    return function () {
        var now = new Date();
        if (now - lastTime >= timeFrame) {
            lastTime = now;
            func.apply(this, arguments);
        }
    };
}
// from stackoverflow. complex but it works
function formatBytes(bytes, decimals) {
    if (bytes < 0) return "-" + formatBytes(-bytes, decimals);
    if (bytes === 0) return '0 Octet';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go', 'To', 'Po', 'Eo', 'Zo', 'Yo'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
function round_time_10(v) {
    return "" + Math.min(Math.round(v / 10), 5) + "0";
}

function format_remaining_time(seconds) {
    if (seconds < 60) return seconds + "s";

    var minutes = seconds / 60;
    seconds = seconds % 60;
    if (minutes < 5) return Math.trunc(minutes) + "m" + round_time_10(seconds) + "s";
    if (minutes > 60) return Math.trunc(minutes / 60) + "h" + round_time_10(minutes % 60) + "m";
    return Math.round(minutes) + "m";
}

function call_xhr_raw(method, url, body, prepare_xhr) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        if (prepare_xhr) prepare_xhr(xhr);
        xhr.onerror = reject;
        xhr.onload = function () {
            const resp = exception_to_null(() => JSON.parse(xhr.responseText))
            if (resp && xhr.status === 200) resolve(resp); else reject(resp || xhr.responseText);
        };
        xhr.open(method, url, true);
        xhr.send(body);
    })
}

function call_xhr(method, url, body, prepare_xhr) {
    return call_xhr_raw(method, url, body, prepare_xhr).catch(function (resp) {
        alert("" + (resp && resp.err || resp));
        throw resp;
    })
}
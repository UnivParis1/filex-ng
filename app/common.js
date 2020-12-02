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

function journal(params) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/journal?' + encode_params(params), true);
    xhr.send();
}

function call_xhr_raw(method, url, body, prepare_xhr) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        if (prepare_xhr) prepare_xhr(xhr);
        xhr.ontimeout = _ => {
            journal({ event: 'timeout' });
            reject("network_error")
        }
        xhr.onerror = _ => {
            journal({ event: 'error' });
            reject("network_error")
        }
        xhr.onload = function () {
            const resp = exception_to_null(() => JSON.parse(xhr.responseText))
            if (resp && xhr.status === 200) {
                resolve(resp); 
            } else if (xhr.status === 502) {
                reject("network_error"); // ugly, but simple
            } else {
                journal({ event: 'bad_status', status: xhr.status });
                reject(resp || xhr.responseText);
            }
        };
        xhr.open(method, url, true);
        xhr.send(body);
    })
}

function err_to_string(resp) {
    return resp === "network_error" ? "Échec. Veuillez réessayer." : "" + (resp && resp.err || resp);
}

function call_xhr(method, url, body, prepare_xhr) {
    return call_xhr_raw(method, url, body, prepare_xhr).catch(function (resp) {
        alert(err_to_string(resp));
        throw resp;
    })
}

function random_id() {
    return Math.random().toString(36).slice(2); // ugly but short and enough for our needs
}

var first_get_delay = 200 /* milliseconds */;
var max_get_tries = 10;
function _get_delay(get_try_count) {
    return first_get_delay * Math.pow(2, get_try_count);
}
//console.info("max delay before giving up upload will be", _get_delay(max_get_tries) / 60 / 1000, "minutes");
function _try_to_continue_upload(state, resolve, reject) {
    console.log("try_to_continue_upload", "#" + state.get_try_count);
    setTimeout(() => {
        call_xhr_raw('GET', '/user/upload/partial?' + encode_params({ id: state.id }), null).then(function (partial) {
            var progressing = partial.size > (state.bytes_start || 0);
            console.log("| last upload start " + (state.bytes_start / 1e6), "| server has size " + (partial.size / 1e6), " => progressing is " + progressing, "| prev is_upload_retry " + state.is_upload_retry);
            if (!state.is_upload_retry || progressing) {
                console.log("trying partial upload at", partial.size);
                state.bytes_start = partial.size
                state.is_upload_retry = !progressing;
                resolve(state);
            } else {
                reject('network_error');
            }
        }).catch(function (err) {
            if (err === "network_error" && state.get_try_count <= max_get_tries) {
                state.get_try_count++;
                _try_to_continue_upload(state, resolve, reject);
            } else if (err.err === 'partial_upload_impossible' && !state.is_upload_retry) {
                console.log("retry from beginning");
                delete state.bytes_start;
                state.is_upload_retry = true
                resolve(state);
            } else {
                console.error(err)
                reject('network_error'); // rethrowing initial error
            }
        })
    }, _get_delay(state.get_try_count))
}

// upload state = { file: File, id: string, bytes_start: number, is_upload_retry: boolean }
function try_to_continue_upload(state) {
    state.get_try_count = 1;
    return new Promise(function (resolve, reject) {
        _try_to_continue_upload(state, resolve, reject);
    })
}


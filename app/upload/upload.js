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
function formatBytes(bytes, decimals) {
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

function call_xhr(method, url, body, prepare_xhr) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        if (prepare_xhr) prepare_xhr(xhr);
        xhr.onerror = reject;
        xhr.onload = function () {
            const resp = JSON.parse(xhr.responseText);
            if (resp) resolve(resp); else reject(xhr.responseText);
        };
        xhr.open(method, url, true);
        xhr.send(body);
    })
}

new Vue({
    data: {
        upload: {
            daykeep_opts: [1,2,3,4,5,6,7,14,15,21,30,45],
            daykeep: 15,
            download_ack: false, summary: false, with_password: false,
            password: undefined,
            file: undefined,
        },
        uploading: {
            xhr: undefined, loaded: 0, total: 0, estimated_remaining_time: '',
        },
        uploaded: {
            get_url: undefined, 
            file_name: undefined, file_size: undefined,
        },
    },
    computed: {
        expiration() {
            return addDays(new Date(), this.upload.daykeep).toLocaleString();
        },
    },
    methods: {
        file_selected(event) {
            this.send_file(event.target.files[0]);
        },
        upload_abort() {
            this.uploading.xhr.abort();
            this.uploading.xhr = undefined;
        },
        send_file(file) {
            var that = this;
            var upload_start_time = new Date();
            var params = {
                'filename': file.name,                
                'type': file.type,
                'daykeep': this.upload.daykeep,
                'download_ack': this.upload.download_ack,
                'summary': this.upload.summary,
                'password': this.upload.with_password && this.upload.password,
            };
            call_xhr('POST', '/user/upload?' + encode_params(params), file, function (xhr) {
                that.uploading.xhr = xhr;
                xhr.upload.onprogress = throttle_some(function (pe) {
                    that.uploading.loaded = pe.loaded;
                    that.uploading.total = pe.total;
                    var upload_duration = (new Date() - upload_start_time) / 1000;
                    that.uploading.estimated_remaining_time = 
                        // wait for 10s or 10%
                        upload_duration > 10 || pe.loaded > pe.total / 10 ? 
                            format_remaining_time(Math.round(upload_duration / pe.loaded * (pe.total - pe.loaded))) : 
                            '';
                }, 500);
            }).then(function (resp) {
                that.uploaded.get_url = resp.get_url;
            }).finally(function () {
                that.uploading.xhr = undefined;
            });

            this.uploaded.file_name = file.name;
            this.uploaded.file_size = formatBytes(file.size, 2);
        },
    },
}).$mount("#main");
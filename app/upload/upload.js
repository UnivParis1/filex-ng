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

new Vue({
    data: {
        daykeep_opts: [1,2,3,4,5,6,7,14,15,21,30,45],
        daykeep: 15,
        download_ack: false, summary: false, with_password: false,
        password: undefined,
        file: undefined,
        xhr: undefined, loaded: 0, total: 0,

        get_url: undefined, file_name: undefined, file_size: undefined,
    },
    computed: {
        expiration() {
            return addDays(new Date(), this.daykeep).toLocaleString();
        },
    },
    methods: {
        file_selected(event) {
            this.file = event.target.files[0];
            this.send_file(this.file);
        },
        abort() {
            this.xhr.abort();
            this.xhr = undefined;
        },
        send_file() {
            var xhr = new XMLHttpRequest();
            var that = this;
            xhr.upload.onprogress = throttle_some(function (pe) {
                that.loaded = pe.loaded;
                that.total = pe.total;
            }, 500);
            xhr.onload = function () {
                console.log("success"); 
                that.xhr = undefined;
                console.log(xhr.responseText);
                var resp = JSON.parse(xhr.responseText);
                if (resp) {
                    that.get_url = resp.get_url;
                }
            };
            var params = {
                'filename': this.file.name,                
                'type': this.file.type,
                'daykeep': this.daykeep,
                'download_ack': this.download_ack,
                'summary': this.summary,
                'password': this.with_password && this.password,
            };
            xhr.open('post', '/upload?' + encode_params(params), true);
            xhr.send(this.file);
            this.xhr = xhr;

            this.file_name = this.file.name;
            this.file_size = formatBytes(this.file.size, 2);
        },
    },
}).$mount("#main");
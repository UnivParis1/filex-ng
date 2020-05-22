new Vue({
    created() {
        this.get_user_info()
    },
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
        info: undefined,
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
            }).catch(function (resp) {
                alert(resp && resp.err || resp);
            }).finally(function () {
                that.uploading.xhr = undefined;
            });

            this.uploaded.file_name = file.name;
            this.uploaded.size = file.size;
        },
        get_user_info() {
            var that = this;
            call_xhr('GET', '/user/info', null).then(function (info) {
                that.info = info;
            })
        },
        back_to_upload_choice() {
            this.uploaded.get_url = undefined
            this.get_user_info() // update it
        }
    },
    filters: {
        formatBytes: formatBytes,
    },
}).$mount("#main");
const daykeep_opts = [1,2,3,4,5,6,7,14,15,21,30,45];

Vue.createApp({
    created() {
        this.get_user_info()
    },
    data: () => ({
        upload: {
            daykeep: 15,
            notify_on_download: false, notify_on_delete: false, with_password: false,
            password: undefined,
            file: undefined,
        },
        uploading: {
            xhr: undefined, loaded: 0, total: 0, estimated_remaining_time: '',
            trying_to_continue: false,
        },
        uploaded: {
            get_url: undefined, 
            file_name: undefined, file_size: undefined,
        },
        info: undefined,
        dragging_over_drop_zone: false,
    }),
    computed: {
        expiration() {
            return addDays(new Date(), this.upload.daykeep).toLocaleString();
        },
        daykeep_opts() {
            var max_daykeep = this.info && this.info.max_daykeep;
            if (!max_daykeep) return;

            // prune non allowed values
            l = daykeep_opts.filter(function (daykeep) { return daykeep <= max_daykeep });

            // allow users to choose their exact max_daykeep (useful for users with max_daykeep exemption)
            if (l[l.length-1] < max_daykeep) l.push(max_daykeep)

            return l;
        },
    },
    methods: {
        file_selected(event) {
            this.send_file({ file: event.target.files[0], id: random_id() });
        },
        ondrop(ev) {
            if (ev.dataTransfer.files.length > 1) {
                alert("Le téléversement multi-fichier n'est pas supporté.")
            } else {
                let file = ev.dataTransfer.files[0];
                if (file) this.send_file({ file: file, id: random_id() });
            }
        },
        upload_abort() {
            journal({ action: 'upload_abort', state: this.uploading.xhr ? 'xhr' : this.uploading.trying_to_continue ? 'trying_to_continue' : 'weird' });
            if (this.uploading.xhr) this.uploading.xhr.abort();
            this.uploading.xhr = undefined;
            this.uploading.trying_to_continue = false;
        },
        send_file(state) {
            var that = this;
            var upload_start_time = new Date();
            var file = state.file
            var params = {
                'filename': file.name,                
                'type': file.type,
                'daykeep': this.upload.daykeep,
                'notify_on_download': this.upload.notify_on_download,
                'notify_on_delete': this.upload.notify_on_delete,
                'password': this.upload.with_password && this.upload.password,
                'id': state.id,
            };
            if (state.bytes_start) params.bytes_start = state.bytes_start
            call_xhr_raw('POST', '/user/upload?' + encode_params(params), file.slice(state.bytes_start || 0), function (xhr) {
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
                if (!that.uploading.xhr) {
                    // user aborted, ignore!
                } else if (resp === 'network_error') {
                    that.try_to_continue_upload(state)
                } else {
                    alert(err_to_string(resp));
                }
            }).finally(function () {
                that.uploading.xhr = undefined;
            });

            this.uploaded.file_name = file.name;
            this.uploaded.size = file.size;
        },
        try_to_continue_upload(state) {
            var that = this;
            that.uploading.trying_to_continue = true
            try_to_continue_upload(state).then(function() { 
                that.send_file(state);
            }).catch(function(err) {
                console.error("give up upload", err);
                alert(err_to_string(err));
            }).finally(function () {
                that.uploading.trying_to_continue = false;
            })
        },
        get_user_info() {
            var that = this;
            call_xhr('GET', '/user/info', null).then(function (info) {
                that.info = info;
                // for users with max_daykeep exemption lower than other users
                if (that.upload.daykeep > info.max_daykeep) {
                    that.upload.daykeep = info.max_daykeep
                }
            })
        },
        back_to_upload_choice() {
            this.uploaded.get_url = undefined
            this.get_user_info() // update it
        },
        formatBytes: formatBytes,
    },
}).mount("#main");
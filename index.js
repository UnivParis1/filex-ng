#!/usr/bin/env nodejs

const express = require('express')
const session = require('express-session');
const conf = require('./conf')
const shib = require('./api/shib')
const api = require('./api/api')


const app = express()

app.use('/upload', session({secret: conf.session.secret, resave: false, saveUninitialized: false}));
app.use('/upload', shib.ensure_connected)
app.put('/upload', api.handle_upload)
app.post('/upload', api.handle_upload)
app.get('/get', api.handle_download) 
  
app.use("/node_modules", express.static(__dirname + '/node_modules'))
app.use(express.static(__dirname + '/app'))

// fallback
app.all((_, res) => res.redirect("/upload"))

app.listen(conf.port)

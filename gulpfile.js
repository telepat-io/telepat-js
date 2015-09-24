var browserify = require('browserify'),
  gulp       = require('gulp'),
  source     = require('vinyl-source-stream'),
  buffer     = require('vinyl-buffer'),
  uglify     = require('gulp-uglify'),
  Docker     = require('docker'),
  browserSync = require('browser-sync').create();

gulp.task('build', function () {
  return browserify([__dirname + '/lib/telepat.js'], {standalone: 'Telepat'}).bundle()
    .pipe(source('telepat.js'))
    .pipe(buffer())
    //.pipe(uglify())
    .pipe(gulp.dest(__dirname + '/dist'));
});

gulp.task('docs', function () {
  var docker = new Docker({ inDir: '.', css: ['doc/custom.css'] });
  docker.doc(['README.md', 'lib/telepat.js', 'lib/channel.js', 'lib/user.js', 'lib/admin.js']);
});

gulp.task('js-watch', ['build'], browserSync.reload);

gulp.task('serve', function() {
    browserSync.init({
        port: 3002,
        server: {
            baseDir: ["./example", "./"]
        }
    });

    gulp.watch("lib/*.js", ['js-watch']);
});
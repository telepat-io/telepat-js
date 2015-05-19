var browserify = require('browserify'),
  gulp       = require('gulp'),
  source     = require('vinyl-source-stream'),
  buffer     = require('vinyl-buffer'),
  uglify     = require('gulp-uglify'),
  browserSync = require('browser-sync').create();

gulp.task('build', function () {
  return browserify([__dirname + '/lib/telepat.js'], {standalone: 'Telepat'}).bundle()
    .pipe(source('telepat.js'))
    .pipe(buffer())
    //.pipe(uglify())
    .pipe(gulp.dest(__dirname + '/dist'));
});

gulp.task('js-watch', ['build'], browserSync.reload);

gulp.task('serve', function() {
    browserSync.init({
        server: {
            baseDir: "./"
        }
    });

    gulp.watch("lib/*.js", ['js-watch']);
});
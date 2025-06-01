Autocracy
=========

Absolute power to orchestrate OCR.


Installing
----------

    $ npm install -g autocracy

Alternatively, don't install it and just prepend the below commands with `npx`.

Completions for Zsh will also be installed if a directory exists:

    $ mkdir -p /usr/local/share/zsh/site-functions
    $ chown -R $(whoami) /usr/local/share/zsh/site-functions

You will also need to install tools that Autocracy relies on to operate, [Tesseract](https://github.com/tesseract-ocr/tesseract), [MuPDF](https://github.com/ArtifexSoftware/mupdf), and [QPDF](https://github.com/qpdf/qpdf). On a Mac with Homebrew these can be installed with `brew install tesseract mupdf qpdf`. With Apt you will need to run `apt install tesseract-ocr mupdf-tools qpdf`.

If not using Homebrew check your Tesseract installation includes the fast training data for your desired languages, which can otherwise be downloaded [from here](https://github.com/tesseract-ocr/tessdata_fast).


Usage
-----

To output text files:

    $ autocracy get-text <origin> <destination>

To output new PDF files with embedded text:

    $ autocracy make-searchable <origin> <destination>

In either case, the origin should be a directory of PDF files. The destination should be the name of a directory to be created for the results.

By default, Autocracy will first attempt to extract any tagged-text from within the PDF files. If tagged-text is found, it is used instead of (much slower) OCR. To disable this use the `--force-ocr` flag. The `--preprocess` flag will do some processing to attempt to improve OCR quality. The language expected in the documents defaults to English, but can be specified by passing the `--language` flag one of the language codes [from this page](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html).

A directory named `.autocracy-cache` will be created to contain intermediate files. These will be used on subsequent invocations of Autocracy. You will want to delete this directory after you finish.


See also
--------

* [OCR my PDF](https://github.com/ocrmypdf/OCRmyPDF)

# Third-party notices

`@reactvision/viro-web-renderer` is MIT (see `LICENSE`). The package also ships
two prebuilt binaries — `wasm/viro-web.wasm` and `wasm/viro-web.data` — that
contain code and data from the projects below. Those projects' licences permit
redistribution and require that their notices travel with the binary, which is
what this file is for.

Nothing here restricts your use of this package beyond the MIT licence. The
obligations are notice obligations, and they are met by keeping this file with
the package.

---

## Independent JPEG Group — libjpeg 9

This software is based in part on the work of the Independent JPEG Group.

> The authors make NO WARRANTY or representation, either express or implied,
> with respect to this software, its quality, accuracy, merchantability, or
> fitness for a particular purpose. This software is provided "AS IS", and you,
> its user, assume the entire risk as to its quality and accuracy.
>
> This software is copyright (C) 1991-2013, Thomas G. Lane, Guido Vollbeding.
> All Rights Reserved except as specified below.
>
> Permission is hereby granted to use, copy, modify, and distribute this
> software (or portions thereof) for any purpose, without fee, subject to these
> conditions:
> (1) If any part of the source code for this software is distributed, then this
> README file must be included, with this copyright and no-warranty notice
> unaltered; and any additions, deletions, or changes to the original files
> must be clearly indicated in accompanying documentation.
> (2) If only executable code is distributed, then the accompanying
> documentation must state that "this software is based in part on the work of
> the Independent JPEG Group".
> (3) Permission for use of this software is granted only if the user accepts
> full responsibility for any undesirable consequences; the authors accept
> NO LIABILITY for damages of any kind.

---

## FreeType 2.6.0

Portions of this software are copyright © 2015 The FreeType Project
(<https://www.freetype.org>). All rights reserved.

Used under the FreeType Project License (FTL), which permits redistribution in
binary form provided this credit appears in the documentation — which is what
the sentence above is. Built from the Emscripten port.

---

## Bullet Physics 2.82

> Bullet Continuous Collision Detection and Physics Library
> Copyright (c) 2003-2013 Erwin Coumans <http://bulletphysics.org>
>
> This software is provided 'as-is', without any express or implied warranty.
> In no event will the authors be held liable for any damages arising from the
> use of this software.
>
> Permission is granted to anyone to use this software for any purpose,
> including commercial applications, and to alter it and redistribute it
> freely, subject to the following restrictions:
>
> 1. The origin of this software must not be misrepresented; you must not claim
>    that you wrote the original software. If you use this software in a
>    product, an acknowledgment in the product documentation would be
>    appreciated but is not required.
> 2. Altered source versions must be plainly marked as such, and must not be
>    misrepresented as being the original software.
> 3. This notice may not be removed or altered from any source distribution.

---

## Protocol Buffers 3.2.0 (protobuf-lite)

> Copyright 2008 Google Inc. All rights reserved.
>
> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are met:
>
> * Redistributions of source code must retain the above copyright notice, this
>   list of conditions and the following disclaimer.
> * Redistributions in binary form must reproduce the above copyright notice,
>   this list of conditions and the following disclaimer in the documentation
>   and/or other materials provided with the distribution.
> * Neither the name of Google Inc. nor the names of its contributors may be
>   used to endorse or promote products derived from this software without
>   specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
> AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
> IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
> ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
> LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
> CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
> SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
> INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
> CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
> ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
> POSSIBILITY OF SUCH DAMAGE.

---

## zlib, SDL2, SDL2_image, libpng

Linked from the Emscripten ports (`-sUSE_ZLIB`, `-sUSE_SDL=2`,
`-sUSE_SDL_IMAGE=2`, PNG only).

- **zlib** — © 1995-2024 Jean-loup Gailly and Mark Adler, zlib licence.
- **SDL2** — © 1997-2024 Sam Lantinga, zlib licence.
- **SDL2_image** — © 1997-2024 Sam Lantinga, zlib licence.
- **libpng** — © 1995-2024 The PNG Reference Library Authors, PNG Reference
  Library licence.

All four are permissive: use, modify and redistribute freely, without
misrepresenting the origin of the software, and without removing their notices.

---

## Emscripten runtime

`wasm/viro-web.js` is generated by Emscripten and contains its runtime support
code. © 2010-2024 Emscripten authors, MIT / University of Illinois NCSA
open-source licence.

---

## DejaVu Sans (inside `wasm/viro-web.data`)

The renderer preloads one font, used for `ViroText` and as the fallback for any
family a page asks for that is not there.

The full licence text is preloaded into the WASM filesystem beside the font, at
`/LICENSE_DEJAVU.txt`, so that copying the three `wasm/` files to a CDN — which
is a documented way to deploy this — cannot separate the font from its notice.

> Fonts are © 2003 Bitstream, Inc. All Rights Reserved. Bitstream Vera is a
> trademark of Bitstream, Inc. DejaVu changes are in public domain. Glyphs
> imported from Arev fonts are © 2006 Tavmjong Bah. All Rights Reserved.
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of the fonts accompanying this license ("Fonts") and associated documentation
> files (the "Font Software"), to reproduce and distribute the Font Software,
> including without limitation the rights to use, copy, merge, publish,
> distribute, and/or sell copies of the Font Software, and to permit persons to
> whom the Font Software is furnished to do so, subject to the following
> conditions:
>
> The above copyright and trademark notices and this permission notice shall be
> included in all copies of one or more of the Font Software typefaces.
>
> The Font Software may be modified, altered, or added to, and in particular the
> designs of glyphs or characters in the Fonts may be modified and additional
> glyphs or characters may be added to the Fonts, only if the fonts are renamed
> to names not containing either the words "Bitstream" or the word "Vera".
>
> This License becomes null and void to the extent applicable to Fonts or Font
> Software that has been modified and is distributed under the "Bitstream Vera"
> names.
>
> The Font Software may be sold as part of a larger software package but no copy
> of one or more of the Font Software typefaces may be sold by itself.
>
> THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
> OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF COPYRIGHT, PATENT,
> TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL BITSTREAM OR THE GNOME FOUNDATION
> BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, INCLUDING ANY GENERAL,
> SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES, WHETHER IN AN ACTION
> OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF THE USE OR INABILITY TO
> USE THE FONT SOFTWARE OR FROM OTHER DEALINGS IN THE FONT SOFTWARE.
>
> Except as contained in this notice, the names of Gnome, the Gnome Foundation,
> and Bitstream Inc., shall not be used in advertising or otherwise to promote
> the sale, use or other dealings in this Font Software without prior written
> authorization from the Gnome Foundation or Bitstream Inc., respectively. For
> further information, contact: fonts at gnome dot org.
>
> The Arev glyphs carry the same terms under the name "Tavmjong Bah"/"Arev";
> see `/LICENSE_DEJAVU.txt` in the WASM filesystem for that text in full.

### A note on what used to be here

Before v0.1.0 the preloaded font was Helvetica, inherited from the renderer's
preload directory — 2.3 MB of the 2.4 MB payload, and Linotype's to license, not
ours to redistribute. It was replaced with DejaVu Sans before the first
publish. `test/package.test.mjs` fails the build if it comes back.

#!/usr/bin/env python3
"""
Iris 3D Eye Test - Renders a realistic 3D eye model with dynamic iris color.
Uses GTK4 + layer-shell for Wayland overlay, OpenGL for rendering.
"""

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Gtk4LayerShell', '1.0')

from gi.repository import Gtk, Gdk, GLib, Gtk4LayerShell as LayerShell
import math
import numpy as np
from OpenGL.GL import *
from OpenGL.GL import shaders
import ctypes
from pathlib import Path
import pyassimp
from PIL import Image

# Window settings
WINDOW_SIZE = 200
MARGIN_TOP = 20
MARGIN_RIGHT = 20

# Model path - use the FBX with matching textures
MODEL_DIR = Path(__file__).parent / "eye_model"
MODEL_PATH = MODEL_DIR / "source" / "Eye.fbx"
TEXTURE_DIR = MODEL_DIR / "textures"
TEXTURE_COLOR = TEXTURE_DIR / "eyeColor.jpg"

# Vertex shader
VERTEX_SHADER = """
#version 330 core
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec2 uv;

uniform mat4 model;
uniform mat4 view;
uniform mat4 projection;

out vec3 frag_pos;
out vec3 frag_normal;
out vec2 frag_uv;

void main() {
    frag_pos = vec3(model * vec4(position, 1.0));
    frag_normal = mat3(transpose(inverse(model))) * normal;
    frag_uv = uv;
    gl_Position = projection * view * model * vec4(position, 1.0);
}
"""

# Fragment shader with texture and hue shifting
FRAGMENT_SHADER = """
#version 330 core
in vec3 frag_pos;
in vec3 frag_normal;
in vec2 frag_uv;

uniform sampler2D tex_diffuse;
uniform float hue_shift;
uniform vec3 light_pos;
uniform vec3 view_pos;
uniform int is_iris;  // 1 for iris mesh, 0 for sclera

out vec4 frag_color;

// RGB to HSV
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// HSV to RGB
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec4 tex_color = texture(tex_diffuse, frag_uv);
    vec3 color = tex_color.rgb;

    // Apply hue shift to iris mesh
    if (is_iris == 1) {
        vec3 hsv = rgb2hsv(color);
        // Only shift colored pixels (saturation > threshold)
        if (hsv.y > 0.1) {
            hsv.x = fract(hsv.x + hue_shift);
            // Boost saturation slightly for more vivid colors
            hsv.y = min(hsv.y * 1.2, 1.0);
            color = hsv2rgb(hsv);
        }
    }

    // Lighting
    vec3 norm = normalize(frag_normal);
    vec3 light_dir = normalize(light_pos - frag_pos);

    // Ambient
    vec3 ambient = 0.4 * color;

    // Diffuse
    float diff = max(dot(norm, light_dir), 0.0);
    vec3 diffuse = diff * color;

    // Specular (wet eye look)
    vec3 view_dir = normalize(view_pos - frag_pos);
    vec3 reflect_dir = reflect(-light_dir, norm);
    float spec = pow(max(dot(view_dir, reflect_dir), 0.0), 32.0);
    vec3 specular = vec3(0.5) * spec;

    vec3 result = ambient + diffuse + specular;

    frag_color = vec4(result, tex_color.a);
}
"""


def perspective_matrix(fov, aspect, near, far):
    """Create a perspective projection matrix."""
    f = 1.0 / math.tan(fov / 2)
    matrix = np.zeros((4, 4), dtype=np.float32)
    matrix[0, 0] = f / aspect
    matrix[1, 1] = f
    matrix[2, 2] = (far + near) / (near - far)
    matrix[2, 3] = (2 * far * near) / (near - far)
    matrix[3, 2] = -1
    return matrix


def look_at(eye, center, up):
    """Create a view matrix."""
    f = np.array(center) - np.array(eye)
    f = f / np.linalg.norm(f)
    s = np.cross(f, up)
    s = s / np.linalg.norm(s)
    u = np.cross(s, f)
    matrix = np.eye(4, dtype=np.float32)
    matrix[0, :3] = s
    matrix[1, :3] = u
    matrix[2, :3] = -f
    matrix[0, 3] = -np.dot(s, eye)
    matrix[1, 3] = -np.dot(u, eye)
    matrix[2, 3] = np.dot(f, eye)
    return matrix


def rotation_matrix_y(angle):
    """Create a Y-axis rotation matrix."""
    c, s = math.cos(angle), math.sin(angle)
    return np.array([
        [c, 0, s, 0],
        [0, 1, 0, 0],
        [-s, 0, c, 0],
        [0, 0, 0, 1]
    ], dtype=np.float32)


def rotation_matrix_x(angle):
    """Create an X-axis rotation matrix."""
    c, s = math.cos(angle), math.sin(angle)
    return np.array([
        [1, 0, 0, 0],
        [0, c, -s, 0],
        [0, s, c, 0],
        [0, 0, 0, 1]
    ], dtype=np.float32)


class MeshData:
    """Holds OpenGL data for a single mesh."""
    def __init__(self, name):
        self.name = name
        self.vao = None
        self.vbo = None
        self.ebo = None
        self.texture = None
        self.index_count = 0
        self.is_iris = False


class EyeRenderer:
    """OpenGL eye renderer using real 3D model."""

    def __init__(self):
        self.shader = None
        self.meshes = []
        self.time = 0.0
        self.hue = 0.0
        self.rotation_y = 0.0
        self.rotation_x = 0.0
        self.initialized = False
        self.model_scale = 1.0
        self.model_offset = np.array([0.0, 0.0, 0.0])

    def load_model(self):
        """Load the FBX model using pyassimp."""
        print(f"Loading model from {MODEL_PATH}...", flush=True)

        with pyassimp.load(str(MODEL_PATH)) as scene:
            meshes_data = []

            for mesh in scene.meshes:
                print(f"  Processing mesh: {mesh.name}", flush=True)

                data = MeshData(mesh.name)

                # Check if this is the iris mesh
                data.is_iris = "eye" in mesh.name.lower() or "iris" in mesh.name.lower()
                print(f"    Is iris: {data.is_iris}", flush=True)

                # Get vertices
                vertices = np.array(mesh.vertices, dtype=np.float32)

                # Get normals
                if mesh.normals is not None and len(mesh.normals) > 0:
                    normals = np.array(mesh.normals, dtype=np.float32)
                else:
                    normals = np.zeros_like(vertices)

                # Generate front-hemisphere UVs from vertex positions
                # This projects the texture onto just the front of the eye
                center = vertices.mean(axis=0)
                centered = vertices - center
                norms = np.linalg.norm(centered, axis=1, keepdims=True)
                norms[norms == 0] = 1  # Avoid division by zero
                normalized = centered / norms

                # Front hemisphere projection: use X and Y directly, scaled to 0-1
                # This puts the center of the texture at the front (Z+) of the sphere
                uvs = np.zeros((len(vertices), 2), dtype=np.float32)
                uvs[:, 0] = 0.5 + normalized[:, 0] * 0.5  # X maps to U
                uvs[:, 1] = 0.5 - normalized[:, 1] * 0.5  # Y maps to V (inverted)

                # Get faces (triangulated)
                faces = np.array([face for face in mesh.faces], dtype=np.uint32).flatten()

                data.vertices = vertices
                data.normals = normals
                data.uvs = uvs
                data.faces = faces
                data.texture_image = None  # Will load external texture
                data.index_count = len(faces)

                meshes_data.append(data)

            # Calculate bounding box for scaling
            all_verts = np.vstack([m.vertices for m in meshes_data])
            bbox_min = all_verts.min(axis=0)
            bbox_max = all_verts.max(axis=0)
            bbox_size = bbox_max - bbox_min
            self.model_scale = 1.5 / max(bbox_size)
            self.model_offset = -(bbox_min + bbox_max) / 2

            print(f"  Scale: {self.model_scale}, Offset: {self.model_offset}", flush=True)

            return meshes_data

    def init_gl(self):
        """Initialize OpenGL resources."""
        if self.initialized:
            return

        # Compile shaders
        vertex_shader = shaders.compileShader(VERTEX_SHADER, GL_VERTEX_SHADER)
        fragment_shader = shaders.compileShader(FRAGMENT_SHADER, GL_FRAGMENT_SHADER)
        self.shader = shaders.compileProgram(vertex_shader, fragment_shader)

        # Load model
        meshes_data = self.load_model()

        # Create OpenGL objects for each mesh
        for data in meshes_data:
            # Interleave vertex data
            vertex_count = len(data.vertices)
            interleaved = np.zeros(vertex_count * 8, dtype=np.float32)
            for i in range(vertex_count):
                interleaved[i*8:i*8+3] = data.vertices[i]
                interleaved[i*8+3:i*8+6] = data.normals[i]
                interleaved[i*8+6:i*8+8] = data.uvs[i]

            # Create VAO
            data.vao = glGenVertexArrays(1)
            glBindVertexArray(data.vao)

            # Create VBO
            data.vbo = glGenBuffers(1)
            glBindBuffer(GL_ARRAY_BUFFER, data.vbo)
            glBufferData(GL_ARRAY_BUFFER, interleaved.nbytes, interleaved, GL_STATIC_DRAW)

            # Create EBO
            data.ebo = glGenBuffers(1)
            glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, data.ebo)
            glBufferData(GL_ELEMENT_ARRAY_BUFFER, data.faces.nbytes, data.faces, GL_STATIC_DRAW)

            # Set vertex attributes
            stride = 8 * 4
            glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, stride, ctypes.c_void_p(0))
            glEnableVertexAttribArray(0)
            glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, stride, ctypes.c_void_p(12))
            glEnableVertexAttribArray(1)
            glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, stride, ctypes.c_void_p(24))
            glEnableVertexAttribArray(2)

            # Create texture - use external texture file if model doesn't have one
            texture_image = data.texture_image

            if texture_image is None and TEXTURE_COLOR.exists():
                # Load external texture
                print(f"    Loading external texture: {TEXTURE_COLOR}", flush=True)
                pil_img = Image.open(TEXTURE_COLOR).convert('RGB')
                texture_image = np.array(pil_img, dtype=np.uint8)

            if texture_image is not None:
                data.texture = glGenTextures(1)
                glBindTexture(GL_TEXTURE_2D, data.texture)

                img = texture_image
                if len(img.shape) == 2:
                    img = np.stack([img]*3, axis=-1)
                if img.shape[2] == 3:
                    fmt = GL_RGB
                else:
                    fmt = GL_RGBA

                # Flip vertically for OpenGL
                img = np.flipud(img)

                glTexImage2D(GL_TEXTURE_2D, 0, fmt, img.shape[1], img.shape[0], 0, fmt, GL_UNSIGNED_BYTE, img)
                glGenerateMipmap(GL_TEXTURE_2D)
                glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR)
                glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR)
                glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT)
                glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT)
                print(f"    Loaded texture: {img.shape}", flush=True)
            else:
                # Create white texture as fallback
                data.texture = glGenTextures(1)
                glBindTexture(GL_TEXTURE_2D, data.texture)
                white = np.ones((1, 1, 3), dtype=np.uint8) * 255
                glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB, 1, 1, 0, GL_RGB, GL_UNSIGNED_BYTE, white)
                print(f"    No texture found, using white", flush=True)

            glBindVertexArray(0)
            self.meshes.append(data)

        self.initialized = True
        print("OpenGL initialized", flush=True)

    def render(self, width, height):
        """Render the eye."""
        if not self.initialized:
            self.init_gl()

        glViewport(0, 0, width, height)
        glClearColor(0.0, 0.0, 0.0, 0.0)
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)

        glEnable(GL_DEPTH_TEST)
        glEnable(GL_BLEND)
        glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)
        # Enable backface culling to hide the back of the eyeball
        glEnable(GL_CULL_FACE)
        glCullFace(GL_BACK)

        glUseProgram(self.shader)

        # Matrices
        aspect = width / height if height > 0 else 1.0
        projection = perspective_matrix(math.radians(45), aspect, 0.1, 100.0)
        view = look_at([0, 0, 3], [0, 0, 0], [0, 1, 0])

        # Model matrix: scale, center, then rotate
        scale_mat = np.eye(4, dtype=np.float32)
        scale_mat[0, 0] = scale_mat[1, 1] = scale_mat[2, 2] = self.model_scale

        translate_mat = np.eye(4, dtype=np.float32)
        translate_mat[:3, 3] = self.model_offset

        model = rotation_matrix_y(self.rotation_y) @ rotation_matrix_x(self.rotation_x) @ scale_mat @ translate_mat

        # Set uniforms
        glUniformMatrix4fv(glGetUniformLocation(self.shader, "model"), 1, GL_TRUE, model)
        glUniformMatrix4fv(glGetUniformLocation(self.shader, "view"), 1, GL_TRUE, view)
        glUniformMatrix4fv(glGetUniformLocation(self.shader, "projection"), 1, GL_TRUE, projection)
        glUniform1f(glGetUniformLocation(self.shader, "hue_shift"), self.hue)
        glUniform3f(glGetUniformLocation(self.shader, "light_pos"), 2.0, 2.0, 3.0)
        glUniform3f(glGetUniformLocation(self.shader, "view_pos"), 0.0, 0.0, 3.0)

        # Draw each mesh
        for mesh in self.meshes:
            glActiveTexture(GL_TEXTURE0)
            glBindTexture(GL_TEXTURE_2D, mesh.texture)
            glUniform1i(glGetUniformLocation(self.shader, "tex_diffuse"), 0)
            glUniform1i(glGetUniformLocation(self.shader, "is_iris"), 1 if mesh.is_iris else 0)

            glBindVertexArray(mesh.vao)
            glDrawElements(GL_TRIANGLES, mesh.index_count, GL_UNSIGNED_INT, None)
            glBindVertexArray(0)

    def update(self, dt):
        """Update animation state."""
        self.time += dt
        # Cycle hue (full cycle every 6 seconds)
        self.hue = (self.hue + dt / 6.0) % 1.0
        # Don't reset rotation - let mouse control it


class IrisEyeTest(Gtk.Application):
    """GTK4 application with 3D eye overlay."""

    def __init__(self):
        super().__init__(application_id='com.iris.eye-test')
        self.window = None
        self.gl_area = None
        self.renderer = EyeRenderer()
        self.last_frame_time = 0
        # Mouse state for drag rotation
        self.dragging = False
        self.last_mouse_x = 0
        self.last_mouse_y = 0

    def do_activate(self):
        self.window = Gtk.ApplicationWindow(application=self)
        self.window.set_default_size(WINDOW_SIZE, WINDOW_SIZE)

        # Set up layer shell for overlay
        LayerShell.init_for_window(self.window)
        LayerShell.set_layer(self.window, LayerShell.Layer.OVERLAY)
        LayerShell.set_anchor(self.window, LayerShell.Edge.TOP, True)
        LayerShell.set_anchor(self.window, LayerShell.Edge.RIGHT, True)
        LayerShell.set_margin(self.window, LayerShell.Edge.TOP, MARGIN_TOP)
        LayerShell.set_margin(self.window, LayerShell.Edge.RIGHT, MARGIN_RIGHT)
        LayerShell.set_exclusive_zone(self.window, 0)

        self.window.add_css_class('transparent-window')
        self.load_css()

        self.gl_area = Gtk.GLArea()
        self.gl_area.set_size_request(WINDOW_SIZE, WINDOW_SIZE)
        self.gl_area.set_has_depth_buffer(True)
        self.gl_area.connect('realize', self.on_realize)
        self.gl_area.connect('render', self.on_render)

        # Add mouse event controllers for drag rotation
        drag_gesture = Gtk.GestureDrag()
        drag_gesture.connect('drag-begin', self.on_drag_begin)
        drag_gesture.connect('drag-update', self.on_drag_update)
        drag_gesture.connect('drag-end', self.on_drag_end)
        self.gl_area.add_controller(drag_gesture)

        # Scroll for zoom (optional)
        scroll_controller = Gtk.EventControllerScroll(flags=Gtk.EventControllerScrollFlags.VERTICAL)
        scroll_controller.connect('scroll', self.on_scroll)
        self.gl_area.add_controller(scroll_controller)

        self.window.set_child(self.gl_area)

        GLib.timeout_add(16, self.animate)

        self.window.present()
        print("Eye test window opened", flush=True)

    def load_css(self):
        css = b".transparent-window { background: transparent; }"
        provider = Gtk.CssProvider()
        provider.load_from_data(css)
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

    def on_realize(self, gl_area):
        gl_area.make_current()
        if gl_area.get_error() is not None:
            print(f"GL error: {gl_area.get_error()}", flush=True)
            return
        self.renderer.init_gl()

    def on_render(self, gl_area, context):
        self.renderer.render(gl_area.get_width(), gl_area.get_height())
        return True

    def animate(self):
        current_time = GLib.get_monotonic_time() / 1000000.0
        if self.last_frame_time > 0:
            dt = current_time - self.last_frame_time
        else:
            dt = 0.016
        self.last_frame_time = current_time

        self.renderer.update(dt)
        self.gl_area.queue_render()
        return True

    def on_drag_begin(self, gesture, start_x, start_y):
        self.dragging = True
        self.last_mouse_x = start_x
        self.last_mouse_y = start_y

    def on_drag_update(self, gesture, offset_x, offset_y):
        if self.dragging:
            # Sensitivity factor
            sensitivity = 0.01
            # Update rotation based on drag offset
            self.renderer.rotation_y += offset_x * sensitivity
            self.renderer.rotation_x += offset_y * sensitivity
            # Clamp X rotation to avoid flipping
            self.renderer.rotation_x = max(-math.pi/2, min(math.pi/2, self.renderer.rotation_x))
            self.gl_area.queue_render()

    def on_drag_end(self, gesture, offset_x, offset_y):
        self.dragging = False

    def on_scroll(self, controller, dx, dy):
        # Zoom with scroll wheel
        zoom_sensitivity = 0.1
        self.renderer.model_scale *= (1.0 - dy * zoom_sensitivity)
        self.renderer.model_scale = max(0.5, min(5.0, self.renderer.model_scale))
        self.gl_area.queue_render()
        return True


def main():
    print("Starting Iris Eye Test...", flush=True)
    print("Press Ctrl+C to exit", flush=True)
    app = IrisEyeTest()
    app.run()


if __name__ == '__main__':
    main()

# =============================================
#  QRcraft Pro — app.py
#  Flask Backend
#  Features:
#    - User Register / Login / Logout
#    - Generate QR code (via API)
#    - Save QR history per user
#    - SQLite database
#  Author: Sriram S
# =============================================

from flask import Flask, request, jsonify, session, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from datetime import datetime
import os

# ---- App setup ----
app = Flask(__name__)

# Secret key for session (change this in production!)
app.config['SECRET_KEY'] = 'sriram-qrcraft-secret-2026'

# SQLite database file path
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///qrcraft.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db     = SQLAlchemy(app)
bcrypt = Bcrypt(app)


# =============================================
#  DATABASE MODELS
# =============================================

# User model — stores registered users
class User(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    username   = db.Column(db.String(80), unique=True, nullable=False)
    email      = db.Column(db.String(120), unique=True, nullable=False)
    password   = db.Column(db.String(200), nullable=False)  # hashed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship: one user has many QR codes
    qr_codes   = db.relationship('QRCode', backref='user', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id':         self.id,
            'username':   self.username,
            'email':      self.email,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M')
        }


# QRCode model — stores each generated QR
class QRCode(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    text       = db.Column(db.String(500), nullable=False)   # original URL/text
    qr_url     = db.Column(db.String(600), nullable=False)   # generated QR image URL
    color      = db.Column(db.String(10), default='000000')  # QR dot color (hex)
    bg_color   = db.Column(db.String(10), default='ffffff')  # QR bg color (hex)
    size       = db.Column(db.Integer, default=200)           # QR size in px
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':         self.id,
            'text':       self.text,
            'qr_url':     self.qr_url,
            'color':      self.color,
            'bg_color':   self.bg_color,
            'size':       self.size,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M')
        }


# =============================================
#  HELPER: Check if user is logged in
# =============================================
def get_current_user():
    """Returns the logged-in User object or None."""
    user_id = session.get('user_id')
    if not user_id:
        return None
    return User.query.get(user_id)


# =============================================
#  ROUTE: Serve frontend HTML
# =============================================
@app.route('/')
def index():
    """Serve the main frontend page."""
    return render_template('index.html')


# =============================================
#  AUTH ROUTES
# =============================================

# REGISTER — POST /api/auth/register
@app.route('/api/auth/register', methods=['POST'])
def register():
    """
    Register a new user.
    Body: { username, email, password }
    """
    data = request.get_json()

    # Validate required fields
    if not data or not all(k in data for k in ['username', 'email', 'password']):
        return jsonify({'error': 'Username, email and password are required.'}), 400

    username = data['username'].strip()
    email    = data['email'].strip().lower()
    password = data['password']

    # Check minimum length
    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters.'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters.'}), 400

    # Check if username or email already exists
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already taken.'}), 409
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered.'}), 409

    # Hash the password (never store plain text!)
    hashed_pw = bcrypt.generate_password_hash(password).decode('utf-8')

    # Create and save user
    new_user = User(username=username, email=email, password=hashed_pw)
    db.session.add(new_user)
    db.session.commit()

    # Auto-login after register
    session['user_id'] = new_user.id

    return jsonify({
        'message': 'Account created successfully!',
        'user':    new_user.to_dict()
    }), 201


# LOGIN — POST /api/auth/login
@app.route('/api/auth/login', methods=['POST'])
def login():
    """
    Login an existing user.
    Body: { email, password }
    """
    data = request.get_json()

    if not data or not all(k in data for k in ['email', 'password']):
        return jsonify({'error': 'Email and password are required.'}), 400

    email    = data['email'].strip().lower()
    password = data['password']

    # Find user by email
    user = User.query.filter_by(email=email).first()

    # Check if user exists and password matches
    if not user or not bcrypt.check_password_hash(user.password, password):
        return jsonify({'error': 'Invalid email or password.'}), 401

    # Save user ID in session
    session['user_id'] = user.id

    return jsonify({
        'message': 'Logged in successfully!',
        'user':    user.to_dict()
    }), 200


# LOGOUT — POST /api/auth/logout
@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout the current user by clearing the session."""
    session.pop('user_id', None)
    return jsonify({'message': 'Logged out successfully.'}), 200


# GET CURRENT USER — GET /api/auth/me
@app.route('/api/auth/me', methods=['GET'])
def me():
    """Return the currently logged-in user's info."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Not logged in.'}), 401
    return jsonify({'user': user.to_dict()}), 200


# =============================================
#  QR CODE ROUTES
# =============================================

# GENERATE QR — POST /api/qr/generate
@app.route('/api/qr/generate', methods=['POST'])
def generate_qr():
    """
    Generate a QR code and save to history.
    Body: { text, color?, bg_color?, size? }
    Requires login.
    """
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Please login to generate QR codes.'}), 401

    data = request.get_json()

    if not data or not data.get('text'):
        return jsonify({'error': 'Text or URL is required.'}), 400

    text     = data['text'].strip()
    color    = data.get('color', '000000').lstrip('#')   # remove # if present
    bg_color = data.get('bg_color', 'ffffff').lstrip('#')
    size     = int(data.get('size', 200))

    # Clamp size between 100 and 500
    size = max(100, min(500, size))

    # Build QR image URL using goqr.me free API
    # This is the same API the frontend uses
    qr_url = (
        f"https://api.qrserver.com/v1/create-qr-code/"
        f"?size={size}x{size}"
        f"&color={color}"
        f"&bgcolor={bg_color}"
        f"&ecc=H"
        f"&data={text}"
    )

    # Save to database
    qr_entry = QRCode(
        user_id  = user.id,
        text     = text,
        qr_url   = qr_url,
        color    = color,
        bg_color = bg_color,
        size     = size
    )
    db.session.add(qr_entry)
    db.session.commit()

    return jsonify({
        'message': 'QR code generated!',
        'qr':      qr_entry.to_dict()
    }), 201


# GET QR HISTORY — GET /api/qr/history
@app.route('/api/qr/history', methods=['GET'])
def get_history():
    """
    Get all QR codes for the logged-in user.
    Optional query param: ?limit=10
    Requires login.
    """
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Please login to view history.'}), 401

    # Optional limit param (default: 20)
    limit = request.args.get('limit', 20, type=int)

    # Get most recent QRs first
    qr_codes = (
        QRCode.query
        .filter_by(user_id=user.id)
        .order_by(QRCode.created_at.desc())
        .limit(limit)
        .all()
    )

    return jsonify({
        'history': [qr.to_dict() for qr in qr_codes],
        'total':   len(qr_codes)
    }), 200


# DELETE QR — DELETE /api/qr/<id>
@app.route('/api/qr/<int:qr_id>', methods=['DELETE'])
def delete_qr(qr_id):
    """
    Delete a specific QR code by ID.
    Only the owner can delete their own QR.
    Requires login.
    """
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Please login.'}), 401

    qr = QRCode.query.get(qr_id)

    if not qr:
        return jsonify({'error': 'QR code not found.'}), 404

    # Security: make sure it belongs to this user
    if qr.user_id != user.id:
        return jsonify({'error': 'Not authorized.'}), 403

    db.session.delete(qr)
    db.session.commit()

    return jsonify({'message': 'QR code deleted.'}), 200


# CLEAR ALL HISTORY — DELETE /api/qr/history/clear
@app.route('/api/qr/history/clear', methods=['DELETE'])
def clear_history():
    """Delete ALL QR codes for the logged-in user."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Please login.'}), 401

    QRCode.query.filter_by(user_id=user.id).delete()
    db.session.commit()

    return jsonify({'message': 'History cleared.'}), 200


# =============================================
#  CREATE DATABASE TABLES & RUN
# =============================================
if __name__ == '__main__':
    with app.app_context():
        db.create_all()  # Creates tables if they don't exist
        print("✅ Database ready.")
    print("🚀 QRcraft server running at http://localhost:5000")
    app.run(debug=True)
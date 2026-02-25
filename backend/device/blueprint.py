from flask import Blueprint, jsonify, request
from dashboard.services.ai_handler import call_llm
from device.services.device_client import find_devices, get_device_metadata
from device.services.maude_analyzer import get_maude_summary

device_bp = Blueprint('device', __name__)

@device_bp.route('/search', methods=['GET'])
def search_devices():
    query = request.args.get('q', '')
    skip = int(request.args.get('skip', 0))
    limit = int(request.args.get('limit', 10))
    
    if not query:
        return jsonify({'results': [], 'total': 0})
        
    results, total = find_devices(query, skip=skip, limit=limit)
    return jsonify({'results': results, 'total': total})

@device_bp.route('/metadata/<id>', methods=['GET'])
def device_metadata(id):
    metadata = get_device_metadata(id)
    if not metadata:
        return jsonify({'error': 'Device not found'}), 404
    return jsonify(metadata)

@device_bp.route('/maude/<product_code>', methods=['GET'])
def maude_report(product_code):
    data = get_maude_summary(product_code)
    if not data:
        return jsonify({'error': 'MAUDE data not found'}), 404
    return jsonify(data)

@device_bp.route('/safety/<product_code>', methods=['GET'])
def device_safety_analysis(product_code):
    k_number = request.args.get('id')
    summary = get_maude_summary(product_code, k_number=k_number)
    if not summary:
        return jsonify({'error': 'Safety data not found'}), 404
    return jsonify(summary)

@device_bp.route('/analyze', methods=['POST'])
def analyze_device_label():
    # Placeholder for AI analysis of device labeling (IFUs)
    data = request.json
    text = data.get('text', '')
    prompt = f"Analyze this medical device labeling for safety considerations: {text}"
    analysis = call_llm(prompt)
    return jsonify({'analysis': analysis})

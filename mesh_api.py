from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
import numpy as np
from typing import List
import uuid

router = APIRouter(prefix="/api", tags=["mesh"])

# In-memory storage for demo
MESHES_DB = {}

@router.post("/mesh/upload")
async def upload_mesh(file: UploadFile = File(...)):
    """Upload 3D mesh file"""
    try:
        contents = await file.read()
        mesh_id = str(uuid.uuid4())
        MESHES_DB[mesh_id] = {
            'filename': file.filename,
            'size': len(contents),
            'data': contents
        }
        return JSONResponse({
            'status': 'success',
            'mesh_id': mesh_id,
            'filename': file.filename
        })
    except Exception as e:
        return JSONResponse({'error': str(e)}, status_code=400)

@router.get("/mesh/{mesh_id}")
async def get_mesh(mesh_id: str):
    """Retrieve mesh by ID"""
    if mesh_id not in MESHES_DB:
        return JSONResponse({'error': 'Mesh not found'}, status_code=404)
    return JSONResponse({
        'status': 'success',
        'mesh': MESHES_DB[mesh_id]
    })

@router.get("/models")
async def list_models():
    """List all available models"""
    models = [
        {'id': mesh_id, 'name': m['filename']} 
        for mesh_id, m in MESHES_DB.items()
    ]
    return JSONResponse({
        'status': 'success',
        'models': models,
        'count': len(models)
    })

@router.post("/render")
async def render_mesh(mesh_id: str):
    """Render mesh preview"""
    if mesh_id not in MESHES_DB:
        return JSONResponse({'error': 'Mesh not found'}, status_code=404)
    
    return JSONResponse({
        'status': 'success',
        'preview': f'Preview for {MESHES_DB[mesh_id]["filename"]}',
        'mesh_id': mesh_id
    })

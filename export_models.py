import bpy
from pathlib import Path
root=Path(__file__).resolve().parent
(root/'dist/assets').mkdir(exist_ok=True,parents=True)
for i,path in enumerate(sorted((root.parent/'Blender模型').glob('0*.blend'))):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type in {'MESH','FONT','CURVE'}:o.select_set(True)
    bpy.context.view_layer.objects.active=next(o for o in bpy.context.selected_objects if o.type=='MESH')
    bpy.ops.object.convert(target='MESH')
    bpy.ops.export_scene.gltf(filepath=str(root/'dist/assets'/f'part{i}.glb'),export_format='GLB',use_selection=True,export_yup=False,export_apply=True)
    print('EXPORTED',i,flush=True)

import xml.etree.ElementTree as ET
import os

def clean_tag(tag):
    return tag.split('}')[-1]

def analyze_all_actions_ns_agnostic(kmz_dir_name):
    path = os.path.join("scratch", kmz_dir_name, "wpmz", "waylines.wpml")
    if not os.path.exists(path):
        print(f"Path {path} does not exist!")
        return
    tree = ET.parse(path)
    root = tree.getroot()
    
    print(f"\n==================== ACTIONS IN {kmz_dir_name} ====================")
    doc = None
    for child in root:
        if clean_tag(child.tag) == 'Document':
            doc = child
            break
            
    doc_tags = [clean_tag(c.tag) for c in doc if clean_tag(c.tag) != 'Folder'] if doc is not None else []
    print("Document level elements:", doc_tags)
    print("Root tag:", root.tag)
    
    action_types = set()
    action_group_modes = set()
    trigger_types = set()
    actuator_params = set()
    turn_modes = set()
    heading_modes = set()
    
    for elem in root.iter():
        tag = clean_tag(elem.tag)
        if tag == 'waypointHeadingMode':
            heading_modes.add(elem.text)
        elif tag == 'waypointTurnMode':
            turn_modes.add(elem.text)
        elif tag == 'actionGroupMode':
            action_group_modes.add(elem.text)
        elif tag == 'actionTriggerType':
            trigger_types.add(elem.text)
        elif tag == 'actionActuatorFunc':
            action_types.add(elem.text)
            
    # Check placemark action groups in detail
    for pm in root.iter():
        if clean_tag(pm.tag) == 'Placemark':
            for ag in pm:
                if clean_tag(ag.tag) == 'actionGroup':
                    for child in ag:
                        if clean_tag(child.tag) == 'action':
                            func_elem = None
                            param_elem = None
                            for c in child:
                                if clean_tag(c.tag) == 'actionActuatorFunc':
                                    func_elem = c
                                elif clean_tag(c.tag) == 'actionActuatorFuncParam':
                                    param_elem = c
                            func_name = func_elem.text if func_elem is not None else 'unknown'
                            if param_elem is not None:
                                for p in param_elem:
                                    actuator_params.add(f"{func_name}->{clean_tag(p.tag)}:{p.text}")
                                    
    print("Heading Modes:", heading_modes)
    print("Turn Modes:", turn_modes)
    print("Action Group Modes:", action_group_modes)
    print("Trigger Types:", trigger_types)
    print("Action Types:", action_types)
    print("Actuator Params Summary:")
    for p in sorted(list(actuator_params)):
        print("  ", p)

analyze_all_actions_ns_agnostic("extracted_rc2")
analyze_all_actions_ns_agnostic("extracted_user_failing")
analyze_all_actions_ns_agnostic("extracted_root_other")
analyze_all_actions_ns_agnostic("extracted_error_dir")

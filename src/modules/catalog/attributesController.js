const { query } = require('../../config/db');

async function listAttributeGroups(req, res, next) {
  try {
    const groups = await query('SELECT * FROM attribute_groups ORDER BY name ASC');
    const values = await query('SELECT * FROM attribute_values ORDER BY sort_order ASC, value ASC');

    const result = groups.map((g) => ({
      ...g,
      values: values.filter((v) => v.group_id === g.id)
    }));

    res.json({ success: true, data: { groups: result } });
  } catch (error) {
    next(error);
  }
}

async function createAttributeGroup(req, res, next) {
  try {
    const { name, slug } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ success: false, message: 'Name and slug are required' });
    }

    const result = await query('INSERT INTO attribute_groups (name, slug) VALUES (?, ?)', [name, slug]);
    res.status(201).json({ success: true, message: 'Attribute group created', data: { id: result.insertId } });
  } catch (error) {
    next(error);
  }
}

async function addAttributeValue(req, res, next) {
  try {
    const { groupId } = req.params;
    const { value, display_name, sort_order } = req.body;
    if (!value) {
      return res.status(400).json({ success: false, message: 'Attribute value is required' });
    }

    const result = await query(
      'INSERT INTO attribute_values (group_id, value, display_name, sort_order) VALUES (?, ?, ?, ?)',
      [groupId, value, display_name || value, sort_order || 0]
    );

    res.status(201).json({ success: true, message: 'Attribute value added', data: { id: result.insertId } });
  } catch (error) {
    next(error);
  }
}

async function updateAttributeValue(req, res, next) {
  try {
    const { groupId, valId } = req.params;
    const { value, display_name, sort_order } = req.body;

    await query(
      'UPDATE attribute_values SET value = COALESCE(?, value), display_name = COALESCE(?, display_name), sort_order = COALESCE(?, sort_order) WHERE id = ? AND group_id = ?',
      [value, display_name, sort_order, valId, groupId]
    );

    res.json({ success: true, message: 'Attribute value updated' });
  } catch (error) {
    next(error);
  }
}

async function deleteAttributeValue(req, res, next) {
  try {
    const { groupId, valId } = req.params;
    await query('DELETE FROM attribute_values WHERE id = ? AND group_id = ?', [valId, groupId]);
    res.json({ success: true, message: 'Attribute value deleted' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listAttributeGroups,
  createAttributeGroup,
  addAttributeValue,
  updateAttributeValue,
  deleteAttributeValue
};

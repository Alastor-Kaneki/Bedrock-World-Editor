#include <stdint.h>

static uint32_t crc32c_extend_impl(uint32_t init, const uint8_t *data, uint32_t len) {
  uint32_t c = init ^ 0xffffffffu;
  for (uint32_t i = 0; i < len; ++i) {
    c ^= data[i];
    for (uint32_t k = 0; k < 8; ++k) {
      c = (c & 1u) ? (0x82f63b78u ^ (c >> 1)) : (c >> 1);
    }
  }
  return c ^ 0xffffffffu;
}

__attribute__((export_name("crc32c")))
uint32_t crc32c(const uint8_t *data, uint32_t len) {
  return crc32c_extend_impl(0, data, len);
}

__attribute__((export_name("crc32c_extend")))
uint32_t crc32c_extend(uint32_t init, const uint8_t *data, uint32_t len) {
  return crc32c_extend_impl(init, data, len);
}

__attribute__((export_name("crc_mask")))
uint32_t crc_mask(uint32_t crc) {
  return (((crc >> 15) | (crc << 17)) + 0xa282ead8u);
}

__attribute__((export_name("crc_unmask")))
uint32_t crc_unmask(uint32_t masked) {
  uint32_t rot = masked - 0xa282ead8u;
  return ((rot >> 17) | (rot << 15));
}

static int32_t read_i32_le(const uint8_t *p) {
  uint32_t u = (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
  return (int32_t)u;
}

__attribute__((export_name("dbkey_x")))
int32_t dbkey_x(const uint8_t *key, uint32_t len) {
  return len >= 4 ? read_i32_le(key) : 0;
}

__attribute__((export_name("dbkey_z")))
int32_t dbkey_z(const uint8_t *key, uint32_t len) {
  return len >= 8 ? read_i32_le(key + 4) : 0;
}

__attribute__((export_name("dbkey_dimension")))
int32_t dbkey_dimension(const uint8_t *key, uint32_t len) {
  return len >= 13 ? read_i32_le(key + 8) : 0;
}

__attribute__((export_name("dbkey_type")))
uint32_t dbkey_type(const uint8_t *key, uint32_t len) {
  if (len == 9) return key[8];
  if (len >= 13) return key[12];
  return len > 8 ? key[8] : 0xffffffffu;
}

__attribute__((export_name("pack_internal_key_tag")))
uint64_t pack_internal_key_tag(uint64_t sequence, uint32_t type) {
  return (sequence << 8) | (uint64_t)(type & 0xffu);
}
